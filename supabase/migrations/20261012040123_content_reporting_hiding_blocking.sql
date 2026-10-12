-- Campus Connect content reporting, post hiding and mutual blocking.
-- Source-reviewed against the app's current migrations, but it must still be
-- preflighted/applied in the real Supabase project before deployment.
begin;

-- Abort before changing any existing policies if the live core schema does not
-- match the relations used by the app. Never try to silently reshape core data.
do $$
declare missing_columns text;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.posts') is null
     or to_regclass('public.comments') is null
     or to_regclass('public.likes') is null
     or to_regclass('public.marketplace_listings') is null
     or to_regclass('public.marketplace_reports') is null then
    raise exception 'Content safety migration stopped: expected profiles, posts, comments, likes, marketplace_listings and marketplace_reports tables must exist. Run schema diagnostics first.';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ')
    into missing_columns
  from (values
    ('profiles','id'), ('profiles','username'), ('profiles','name'),
    ('posts','id'), ('posts','author_id'), ('posts','text'), ('posts','media_type'), ('posts','media_urls'),
    ('comments','id'), ('comments','post_id'), ('comments','author_id'), ('comments','text'),
    ('likes','post_id'), ('likes','user_id'),
    ('marketplace_listings','id'), ('marketplace_listings','seller_id'), ('marketplace_listings','images'),
    ('marketplace_listings','title'), ('marketplace_listings','description'), ('marketplace_listings','status'),
    ('marketplace_reports','id'), ('marketplace_reports','listing_id'), ('marketplace_reports','reporter_id'),
    ('marketplace_reports','reason'), ('marketplace_reports','details'), ('marketplace_reports','created_at')
  ) as required(table_name, column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public'
      and c.table_name=required.table_name
      and c.column_name=required.column_name
  );
  if missing_columns is not null then
    raise exception 'Content safety migration stopped: missing expected columns: %. Inspect the live schema before retrying.', missing_columns;
  end if;
end
$$;

create table if not exists public.blocked_users (
  blocker_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_pk primary key (blocker_id, blocked_id),
  constraint blocked_users_no_self_block check (blocker_id <> blocked_id)
);
create index if not exists blocked_users_blocked_id_idx on public.blocked_users (blocked_id, blocker_id);

create table if not exists public.hidden_posts (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint hidden_posts_pk primary key (user_id, post_id)
);
create index if not exists hidden_posts_post_id_idx on public.hidden_posts (post_id, user_id);

-- target_id intentionally has no FK: moderation evidence survives deletion of
-- the reported post/comment/account. The excerpt is a minimal text snapshot.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  target_type text not null check (target_type in ('post','account','comment','reply')),
  target_id uuid not null,
  reported_user_id uuid null references public.profiles(id) on delete set null,
  target_author_id uuid null,
  reason text not null,
  details text null check (details is null or char_length(details) <= 800),
  target_excerpt text not null default '',
  target_media_urls text[] not null default '{}'::text[],
  status text not null default 'pending' check (status in ('pending','under_review','actioned','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  moderator_notes text null check (moderator_notes is null or char_length(moderator_notes) <= 1000),
  constraint content_reports_duplicate_guard unique (reporter_id, target_type, target_id)
);
alter table public.content_reports
  add column if not exists target_media_urls text[] not null default '{}'::text[];
create index if not exists content_reports_queue_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_target_idx on public.content_reports (target_type, target_id, created_at desc);
create unique index if not exists content_reports_comment_reply_duplicate_guard
  on public.content_reports (reporter_id, target_id)
  where target_type in ('comment','reply');
create index if not exists content_reports_reporter_idx on public.content_reports (reporter_id, created_at desc);

-- Only ask whether the signed-in caller and one other account have a block
-- relationship. This avoids exposing arbitrary users' block graph via RPC.
create or replace function public.is_user_blocked(p_other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.uid()) is not null and p_other_user is not null and exists (
    select 1
    from public.blocked_users b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other_user)
       or (b.blocker_id = p_other_user and b.blocked_id = (select auth.uid()))
  ), false)
$$;
revoke all on function public.is_user_blocked(uuid) from public, anon;
grant execute on function public.is_user_blocked(uuid) to authenticated;

-- Moderator role must be assigned in trusted Supabase Auth app_metadata by an
-- administrator; user_metadata is intentionally not trusted for authorisation.
create or replace function public.is_content_moderator()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') in ('moderator','admin'), false)
$$;
revoke all on function public.is_content_moderator() from public, anon;
grant execute on function public.is_content_moderator() to authenticated;

create or replace function public.capture_content_report_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
  v_excerpt text;
  v_username text;
  v_name text;
  v_post_id uuid;
  v_media_urls text[] := '{}'::text[];
  v_recent_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to submit a content report.' using errcode='28000';
  end if;
  new.reporter_id := (select auth.uid());
  new.created_at := now();
  new.status := 'pending';
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.moderator_notes := null;
  new.details := nullif(btrim(new.details), '');

  if new.details is not null and char_length(new.details) > 800 then
    raise exception 'Report details must be 800 characters or fewer.' using errcode='23514';
  end if;

  if new.target_type = 'account' then
    select p.id, p.username, p.name
      into v_author_id, v_username, v_name
      from public.profiles p where p.id = new.target_id;
    if not found then raise exception 'The reported account could not be found.' using errcode='P0001'; end if;
    v_excerpt := left(concat('@', coalesce(v_username, 'unknown'), ' — ', coalesce(v_name, 'Campus Connect account')), 700);
    if new.reason not in ('harassment_bullying','hate_discrimination','threats_violence','spam_scams','sexual_inappropriate','false_misleading','impersonation','other') then
      raise exception 'Choose a valid reason for reporting an account.' using errcode='23514';
    end if;
  elsif new.target_type = 'post' then
    select p.author_id, coalesce(p.text, ''),
           case when p.media_type='image' then coalesce(p.media_urls[1:4], '{}'::text[]) else '{}'::text[] end
      into v_author_id, v_excerpt, v_media_urls
      from public.posts p where p.id = new.target_id;
    if not found then raise exception 'The reported post could not be found.' using errcode='P0001'; end if;
    if new.reason not in ('harassment_bullying','hate_discrimination','threats_violence','spam_scams','sexual_inappropriate','false_misleading','other') then
      raise exception 'Choose a valid reason for reporting a post.' using errcode='23514';
    end if;
  elsif new.target_type in ('comment','reply') then
    select c.author_id, c.text, c.post_id
      into v_author_id, v_excerpt, v_post_id
      from public.comments c where c.id = new.target_id;
    if not found then raise exception 'The reported comment or reply could not be found.' using errcode='P0001'; end if;
    if not exists (select 1 from public.posts p where p.id=v_post_id) then
      raise exception 'The parent post could not be found.' using errcode='P0001';
    end if;
    if new.reason not in ('harassment_bullying','hate_discrimination','threats_violence','spam_scams','sexual_inappropriate','false_misleading','other') then
      raise exception 'Choose a valid reason for reporting this comment or reply.' using errcode='23514';
    end if;
  else
    raise exception 'Unsupported report target.' using errcode='23514';
  end if;

  if v_author_id = new.reporter_id then
    raise exception 'You cannot report your own content.' using errcode='23514';
  end if;
  new.target_author_id := v_author_id;
  new.reported_user_id := v_author_id;
  new.target_excerpt := left(coalesce(v_excerpt, ''), 700);
  new.target_media_urls := coalesce(v_media_urls, '{}'::text[]);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.reporter_id::text, 41));
  select count(*) into v_recent_count
  from public.content_reports r
  where r.reporter_id = new.reporter_id and r.created_at >= now() - interval '1 hour';
  if v_recent_count >= 10 then
    raise exception 'You have reached the content-report limit. Try again later.' using errcode='23514';
  end if;
  return new;
end
$$;
revoke all on function public.capture_content_report_evidence() from public, anon, authenticated;
drop trigger if exists content_reports_capture_evidence on public.content_reports;
create trigger content_reports_capture_evidence
before insert on public.content_reports
for each row execute function public.capture_content_report_evidence();

-- Marketplace reports already exist. Keep their review history if a seller later
-- removes a listing: drop only the FK that previously cascaded report deletion.
alter table public.marketplace_reports
  add column if not exists reported_user_id uuid null references public.profiles(id) on delete set null,
  add column if not exists target_excerpt text not null default '',
  add column if not exists target_image_url text null,
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_at timestamptz null,
  add column if not exists reviewed_by uuid null references public.profiles(id) on delete set null,
  add column if not exists moderator_notes text null;

do $$
declare
  c record;
  listing_attnum smallint;
begin
  select attnum into listing_attnum from pg_attribute
  where attrelid='public.marketplace_reports'::regclass and attname='listing_id' and not attisdropped;
  for c in
    select conname from pg_constraint
    where conrelid='public.marketplace_reports'::regclass
      and contype='f'
      and confrelid='public.marketplace_listings'::regclass
      and listing_attnum = any(conkey)
  loop
    execute format('alter table public.marketplace_reports drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_reports'::regclass and conname='marketplace_reports_status_check') then
    alter table public.marketplace_reports add constraint marketplace_reports_status_check
      check (status in ('pending','under_review','actioned','dismissed'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_reports'::regclass and conname='marketplace_reports_notes_length_check') then
    alter table public.marketplace_reports add constraint marketplace_reports_notes_length_check
      check (moderator_notes is null or char_length(moderator_notes) <= 1000);
  end if;
end
$$;
update public.marketplace_reports r
set reported_user_id = l.seller_id,
    target_excerpt = case when r.target_excerpt = '' then left(concat(coalesce(l.title, 'Marketplace listing'), ' — ', coalesce(l.description, '')), 700) else r.target_excerpt end,
    target_image_url = coalesce(r.target_image_url, l.images[1])
from public.marketplace_listings l
where r.listing_id = l.id and (r.reported_user_id is null or r.target_excerpt = '' or r.target_image_url is null);

create or replace function public.capture_marketplace_report_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller_id uuid;
  v_title text;
  v_description text;
  v_image_url text;
begin
  select l.seller_id, l.title, l.description, l.images[1]
    into v_seller_id, v_title, v_description, v_image_url
    from public.marketplace_listings l
    where l.id=new.listing_id and l.status='active';
  if not found then raise exception 'Only active Marketplace listings can be reported.' using errcode='23514'; end if;
  new.reported_user_id := v_seller_id;
  new.target_excerpt := left(concat(coalesce(v_title, 'Marketplace listing'), ' — ', coalesce(v_description, '')), 700);
  new.target_image_url := v_image_url;
  new.status := 'pending';
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.moderator_notes := null;
  return new;
end
$$;
revoke all on function public.capture_marketplace_report_evidence() from public, anon, authenticated;
drop trigger if exists marketplace_reports_z_capture_evidence on public.marketplace_reports;
create trigger marketplace_reports_z_capture_evidence
before insert on public.marketplace_reports
for each row execute function public.capture_marketplace_report_evidence();
create index if not exists marketplace_reports_queue_idx on public.marketplace_reports (status, created_at desc);

create or replace function public.list_my_blocked_accounts()
returns table (blocked_id uuid, username text, name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  return query
    select b.blocked_id, p.username, p.name, b.created_at
    from public.blocked_users b
    join public.profiles p on p.id=b.blocked_id
    where b.blocker_id=(select auth.uid())
    order by b.created_at desc;
end
$$;
revoke all on function public.list_my_blocked_accounts() from public, anon;
grant execute on function public.list_my_blocked_accounts() to authenticated;

create or replace function public.list_content_reports(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  report_source text,
  id uuid,
  target_type text,
  target_id uuid,
  reported_user_id uuid,
  target_excerpt text,
  target_media_urls text[],
  target_image_url text,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_id uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  moderator_notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer := greatest(coalesce(p_offset,0),0);
begin
  if not public.is_content_moderator() then raise exception 'Moderator access required.' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('pending','under_review','actioned','dismissed') then
    raise exception 'Invalid report status filter.' using errcode='22023';
  end if;
  return query
  select r.report_source, r.id, r.target_type, r.target_id, r.reported_user_id,
         r.target_excerpt, r.target_media_urls, r.target_image_url, r.reason, r.details, r.status, r.created_at,
         r.reporter_id, r.reviewed_at, r.reviewed_by, r.moderator_notes
  from (
    select 'content'::text as report_source, c.id, c.target_type, c.target_id,
           c.reported_user_id, c.target_excerpt, c.target_media_urls, null::text as target_image_url, c.reason, c.details, c.status,
           c.created_at, c.reporter_id, c.reviewed_at, c.reviewed_by, c.moderator_notes
    from public.content_reports c
    union all
    select 'marketplace_listing'::text, m.id, 'marketplace_listing'::text, m.listing_id,
           m.reported_user_id, m.target_excerpt, '{}'::text[] as target_media_urls, m.target_image_url, m.reason, m.details, m.status,
           m.created_at, m.reporter_id, m.reviewed_at, m.reviewed_by, m.moderator_notes
    from public.marketplace_reports m
  ) r
  where p_status is null or r.status=p_status
  order by r.created_at desc, r.id
  limit v_limit offset v_offset;
end
$$;
revoke all on function public.list_content_reports(text,integer,integer) from public, anon;
grant execute on function public.list_content_reports(text,integer,integer) to authenticated;

create or replace function public.review_content_report(
  p_report_id uuid,
  p_source text,
  p_status text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_notes text := nullif(btrim(p_notes), '');
  v_updated integer;
begin
  if not public.is_content_moderator() then raise exception 'Moderator access required.' using errcode='42501'; end if;
  if p_source is null or p_source not in ('content','marketplace_listing') then raise exception 'Invalid report source.' using errcode='22023'; end if;
  if p_status is null or p_status not in ('under_review','actioned','dismissed') then raise exception 'Invalid moderation status.' using errcode='22023'; end if;
  if v_notes is not null and char_length(v_notes)>1000 then raise exception 'Moderator notes must be 1,000 characters or fewer.' using errcode='23514'; end if;

  if p_source='content' then
    select r.status into v_old_status from public.content_reports r where r.id=p_report_id for update;
    if not found then raise exception 'Report not found.' using errcode='P0002'; end if;
    if (v_old_status='pending' and p_status<>'under_review')
       or (v_old_status='under_review' and p_status='under_review')
       or v_old_status in ('actioned','dismissed') then
      raise exception 'Invalid report status transition.' using errcode='23514';
    end if;
    update public.content_reports set status=p_status, moderator_notes=v_notes,
      reviewed_at=now(), reviewed_by=(select auth.uid()) where id=p_report_id;
  else
    select r.status into v_old_status from public.marketplace_reports r where r.id=p_report_id for update;
    if not found then raise exception 'Report not found.' using errcode='P0002'; end if;
    if (v_old_status='pending' and p_status<>'under_review')
       or (v_old_status='under_review' and p_status='under_review')
       or v_old_status in ('actioned','dismissed') then
      raise exception 'Invalid report status transition.' using errcode='23514';
    end if;
    update public.marketplace_reports set status=p_status, moderator_notes=v_notes,
      reviewed_at=now(), reviewed_by=(select auth.uid()) where id=p_report_id;
  end if;
  get diagnostics v_updated = row_count;
  return v_updated=1;
end
$$;
revoke all on function public.review_content_report(uuid,text,text,text) from public, anon;
grant execute on function public.review_content_report(uuid,text,text,text) to authenticated;

-- Rebuild read/write policies rather than adding a permissive policy beside an
-- existing broad one (Postgres permissive policies are OR-ed together).
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('profiles','posts','comments','likes') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;

create policy profiles_select_unblocked on public.profiles
  for select to authenticated
  using (id=(select auth.uid()) or not public.is_user_blocked(id));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id=(select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));

create policy posts_select_visible on public.posts
  for select to authenticated
  using (
    author_id=(select auth.uid())
    or (
      not public.is_user_blocked(author_id)
      and not exists (select 1 from public.hidden_posts h where h.user_id=(select auth.uid()) and h.post_id=posts.id)
    )
  );
create policy posts_insert_own on public.posts
  for insert to authenticated with check (author_id=(select auth.uid()));
create policy posts_update_own on public.posts
  for update to authenticated using (author_id=(select auth.uid())) with check (author_id=(select auth.uid()));
create policy posts_delete_own on public.posts
  for delete to authenticated using (author_id=(select auth.uid()));

create policy comments_select_visible on public.comments
  for select to authenticated
  using (
    not public.is_user_blocked(comments.author_id)
    and exists (
      select 1 from public.posts p
      where p.id=comments.post_id
        and (
          p.author_id=(select auth.uid())
          or (
            not public.is_user_blocked(p.author_id)
            and not exists (select 1 from public.hidden_posts h where h.user_id=(select auth.uid()) and h.post_id=p.id)
          )
        )
    )
  );
create policy comments_insert_unblocked on public.comments
  for insert to authenticated with check (
    author_id=(select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id=comments.post_id
        and (
          p.author_id=(select auth.uid())
          or (
            not public.is_user_blocked(p.author_id)
            and not exists (select 1 from public.hidden_posts h where h.user_id=(select auth.uid()) and h.post_id=p.id)
          )
        )
    )
  );
create policy comments_delete_own on public.comments
  for delete to authenticated using (author_id=(select auth.uid()));

-- Return an unambiguous result for comment deletion without trusting the UI
-- or leaking whether a different user's row exists. A caller can only delete
-- a comment whose author_id matches the authenticated identity.
create or replace function public.delete_my_comment(p_comment_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_deleted integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_comment_id is null then
    raise exception 'The comment could not be identified.' using errcode = '22023';
  end if;

  delete from public.comments c
  where c.id = p_comment_id and c.author_id = v_uid;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;
revoke all on function public.delete_my_comment(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_comment(uuid) to authenticated;

create policy likes_select_visible on public.likes
  for select to authenticated using (
    not public.is_user_blocked(likes.user_id)
    and exists (
      select 1 from public.posts p
      where p.id=likes.post_id
        and (
          p.author_id=(select auth.uid())
          or (
            not public.is_user_blocked(p.author_id)
            and not exists (select 1 from public.hidden_posts h where h.user_id=(select auth.uid()) and h.post_id=p.id)
          )
        )
    )
  );
create policy likes_insert_unblocked on public.likes
  for insert to authenticated with check (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id=likes.post_id
        and (
          p.author_id=(select auth.uid())
          or (
            not public.is_user_blocked(p.author_id)
            and not exists (select 1 from public.hidden_posts h where h.user_id=(select auth.uid()) and h.post_id=p.id)
          )
        )
    )
  );
create policy likes_delete_own on public.likes
  for delete to authenticated using (user_id=(select auth.uid()));

-- User-owned preference tables. Column-level grants make identity fields use
-- their auth.uid() defaults instead of trusting caller-supplied user IDs.
do $$
declare p record; c record;
begin
  for p in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('blocked_users','hidden_posts','content_reports') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
  for c in select table_name, column_name from information_schema.columns
    where table_schema='public' and table_name in ('blocked_users','hidden_posts','content_reports') loop
    execute format('revoke all (%I) on table public.%I from public, anon, authenticated', c.column_name, c.table_name);
  end loop;
end
$$;
alter table public.blocked_users enable row level security;
alter table public.hidden_posts enable row level security;
alter table public.content_reports enable row level security;
revoke all on public.blocked_users, public.hidden_posts, public.content_reports from public, anon, authenticated;

grant select on public.blocked_users to authenticated;
grant insert (blocked_id) on public.blocked_users to authenticated;
grant delete on public.blocked_users to authenticated;
create policy blocked_users_select_own on public.blocked_users for select to authenticated
  using (blocker_id=(select auth.uid()));
create policy blocked_users_insert_own on public.blocked_users for insert to authenticated
  with check (blocker_id=(select auth.uid()) and blocker_id<>blocked_id);
create policy blocked_users_delete_own on public.blocked_users for delete to authenticated
  using (blocker_id=(select auth.uid()));

grant select on public.hidden_posts to authenticated;
grant insert (post_id) on public.hidden_posts to authenticated;
grant delete on public.hidden_posts to authenticated;
create policy hidden_posts_select_own on public.hidden_posts for select to authenticated
  using (user_id=(select auth.uid()));
create policy hidden_posts_insert_own on public.hidden_posts for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and exists (select 1 from public.posts p where p.id=hidden_posts.post_id and p.author_id<>(select auth.uid()) and not public.is_user_blocked(p.author_id))
  );
create policy hidden_posts_delete_own on public.hidden_posts for delete to authenticated
  using (user_id=(select auth.uid()));

grant select (id, target_type, target_id, reported_user_id, reason, details, target_excerpt, status, created_at)
  on public.content_reports to authenticated;
grant insert (target_type, target_id, reason, details) on public.content_reports to authenticated;
create policy content_reports_select_reporter_or_moderator on public.content_reports for select to authenticated
  using (reporter_id=(select auth.uid()) or public.is_content_moderator());
create policy content_reports_insert_self on public.content_reports for insert to authenticated
  with check (reporter_id=(select auth.uid()));
-- There is deliberately no authenticated UPDATE or DELETE policy on reports.

-- Apply the same bilateral block visibility rule to live Marketplace listings.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='marketplace_listings' loop
    execute format('drop policy if exists %I on public.marketplace_listings', p.policyname);
  end loop;
end
$$;
create policy marketplace_listings_select_visible on public.marketplace_listings
  for select to authenticated using (
    seller_id=(select auth.uid())
    or (status='active' and not public.is_user_blocked(seller_id))
  );
create policy marketplace_listings_insert_own on public.marketplace_listings
  for insert to authenticated with check (seller_id=(select auth.uid()));
create policy marketplace_listings_update_own on public.marketplace_listings
  for update to authenticated using (seller_id=(select auth.uid())) with check (seller_id=(select auth.uid()));

commit;
