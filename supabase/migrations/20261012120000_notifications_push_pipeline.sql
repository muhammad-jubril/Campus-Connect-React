-- Notifications backend hardening and Web Push queue.
-- This forward migration expects the existing public.notifications, public.comments,
-- public.posts, public.profiles and public.blocked_users tables used by prior migrations.
-- It deliberately does not invent a follow graph: a follow trigger is attached only
-- if a real public.follows(follower_id, following_id) table exists in this database.
begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('like', 'comment', 'reply', 'follow'));

alter table public.notifications
  add column if not exists comment_id uuid null;

create index if not exists notifications_recipient_unread_created_idx
  on public.notifications (recipient_id, created_at desc)
  where read = false;
create index if not exists notifications_reply_thread_idx
  on public.notifications (recipient_id, comment_id, created_at desc)
  where type = 'reply';

-- Do not expose the bilateral-block lookup through the client API. This function
-- is used by privileged notification triggers and the push dispatcher only.
create or replace function public.is_notification_pair_blocked(p_first_user uuid, p_second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_first_user is null or p_second_user is null or p_first_user = p_second_user
    or exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = p_first_user and b.blocked_id = p_second_user)
         or (b.blocker_id = p_second_user and b.blocked_id = p_first_user)
    ), true
  )
$$;
revoke all on function public.is_notification_pair_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_notification_pair_blocked(uuid, uuid) to service_role;

-- Harden the existing event triggers against self-events, current bilateral blocks,
-- and concurrent duplicate-like notification insertion. A likes row is still the
-- source of truth; repeat likes by the same actor/post remain intentionally deduped.
create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  select p.author_id into v_author from public.posts p where p.id=new.post_id;
  if v_author is null or v_author = new.user_id or public.is_notification_pair_blocked(v_author, new.user_id) then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_author::text || ':' || new.user_id::text || ':' || new.post_id::text, 601215)
  );
  if not exists (
    select 1 from public.notifications n
    where n.recipient_id=v_author and n.actor_id=new.user_id and n.type='like' and n.post_id=new.post_id
  ) then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (v_author, new.user_id, 'like', new.post_id);
  end if;
  return new;
end
$$;
revoke all on function public.notify_on_like() from public, anon, authenticated;

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_parent_id uuid;
  v_parent_author uuid;
begin
  select p.author_id into v_author from public.posts p where p.id=new.post_id;
  v_parent_id := nullif(to_jsonb(new)->>'parent_comment_id', '')::uuid;
  if v_parent_id is not null then
    select c.author_id into v_parent_author from public.comments c where c.id=v_parent_id;
  end if;

  if v_author is not null and v_author <> new.author_id
     and v_parent_author is distinct from v_author
     and not public.is_notification_pair_blocked(v_author, new.author_id) then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (v_author, new.author_id, 'comment', new.post_id);
  end if;
  return new;
end
$$;
revoke all on function public.notify_on_comment() from public, anon, authenticated;

-- A pending batch is coalesced per recipient/group. The advisory transaction lock
-- makes the find-or-create sequence safe when multiple interactions arrive at once.
create table if not exists public.push_notification_queue (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  group_key text not null,
  latest_notification_id uuid null references public.notifications(id) on delete set null,
  activity_count integer not null default 1 check (activity_count > 0),
  first_activity_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  deliver_after timestamptz not null default (now() + interval '60 seconds'),
  status text not null default 'pending'
    check (status in ('pending','processing','sent','dead','superseded')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_at timestamptz null,
  sent_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists push_notification_queue_pending_group_uq
  on public.push_notification_queue (recipient_id, group_key)
  where status = 'pending';
create index if not exists push_notification_queue_dispatch_idx
  on public.push_notification_queue (deliver_after, created_at)
  where status in ('pending','processing');

-- Browser push subscriptions are private server data. Clients must use the edge
-- function; raw endpoints/keys are never directly selectable by authenticated users.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth_secret text not null check (char_length(auth_secret) between 8 and 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Per-device receipts make transient retries skip subscriptions that already accepted
-- a push. A stable Web Notification tag is an additional duplicate-display safeguard.
create table if not exists public.push_delivery_receipts (
  queue_id uuid not null references public.push_notification_queue(id) on delete cascade,
  subscription_id uuid not null,
  state text not null check (state in ('delivered','expired','retryable_failure','permanent_failure')),
  attempts integer not null default 1 check (attempts > 0),
  last_error text null,
  delivered_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (queue_id, subscription_id)
);

alter table public.push_notification_queue enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_receipts enable row level security;
revoke all on public.push_notification_queue, public.push_subscriptions, public.push_delivery_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.push_notification_queue to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.push_delivery_receipts to service_role;

create or replace function public.queue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_key text;
begin
  if new.recipient_id is null or new.actor_id is null or new.actor_id = new.recipient_id then
    return new;
  end if;

  if public.is_notification_pair_blocked(new.recipient_id, new.actor_id) then
    return new;
  end if;

  if new.type = 'like' and new.post_id is not null then
    v_group_key := 'like:post:' || new.post_id::text;
  elsif new.type = 'comment' and new.post_id is not null then
    v_group_key := 'comment:post:' || new.post_id::text;
  elsif new.type = 'reply' and new.comment_id is not null then
    v_group_key := 'reply:comment:' || new.comment_id::text;
  elsif new.type = 'follow' then
    v_group_key := 'follow:day:' || to_char((new.created_at at time zone 'UTC')::date, 'YYYY-MM-DD');
  else
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.recipient_id::text || ':' || v_group_key, 601212)
  );

  update public.push_notification_queue q
  set latest_notification_id = case when new.created_at >= q.last_activity_at then new.id else q.latest_notification_id end,
      activity_count = q.activity_count + 1,
      last_activity_at = greatest(q.last_activity_at, new.created_at),
      updated_at = now()
  where q.recipient_id = new.recipient_id
    and q.group_key = v_group_key
    and q.status = 'pending';

  if not found then
    insert into public.push_notification_queue
      (recipient_id, group_key, latest_notification_id, activity_count, first_activity_at, last_activity_at, deliver_after)
    values
      (new.recipient_id, v_group_key, new.id, 1, new.created_at, new.created_at, new.created_at + interval '60 seconds');
  end if;
  return new;
end
$$;
revoke all on function public.queue_notification_push() from public, anon, authenticated;
drop trigger if exists notifications_queue_push on public.notifications;
create trigger notifications_queue_push
after insert on public.notifications
for each row execute function public.queue_notification_push();

-- Current source creates top-level post comments only. If a deployed schema already
-- has parent_comment_id, this adds distinct reply alerts. It does not fabricate
-- thread relationships in schemas which do not have them.
create or replace function public.notify_on_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_parent_author uuid;
  v_parent_post uuid;
begin
  v_parent_id := nullif(to_jsonb(new)->>'parent_comment_id', '')::uuid;
  if v_parent_id is null then return new; end if;

  select c.author_id, c.post_id into v_parent_author, v_parent_post
  from public.comments c where c.id = v_parent_id;
  if not found or v_parent_author is null or v_parent_author = new.author_id then return new; end if;
  if public.is_notification_pair_blocked(v_parent_author, new.author_id) then return new; end if;

  insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
  values (v_parent_author, new.author_id, 'reply', coalesce(new.post_id, v_parent_post), v_parent_id);
  return new;
end
$$;
revoke all on function public.notify_on_comment_reply() from public, anon, authenticated;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='parent_comment_id'
  ) then
    drop trigger if exists comments_notify_reply on public.comments;
    create trigger comments_notify_reply after insert on public.comments
      for each row execute function public.notify_on_comment_reply();
  end if;
end
$$;

-- Support existing follow implementations without guessing or creating a follow
-- feature. No follows table exists in the checked-in app; this hook is installed only
-- where a real public.follows(follower_id, following_id) relation is already present.
create or replace function public.notify_on_follow_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data jsonb := to_jsonb(new);
  v_actor uuid;
  v_recipient uuid;
begin
  v_actor := nullif(v_data->>'follower_id', '')::uuid;
  v_recipient := nullif(v_data->>'following_id', '')::uuid;
  if v_actor is null or v_recipient is null or v_actor = v_recipient then return new; end if;
  if public.is_notification_pair_blocked(v_actor, v_recipient) then return new; end if;

  insert into public.notifications (recipient_id, actor_id, type)
  values (v_recipient, v_actor, 'follow');
  return new;
end
$$;
revoke all on function public.notify_on_follow_relationship() from public, anon, authenticated;
do $$
begin
  if to_regclass('public.follows') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='follower_id')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='following_id')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='post_id' and is_nullable='YES') then
    drop trigger if exists follows_notify_recipient on public.follows;
    create trigger follows_notify_recipient after insert on public.follows
      for each row execute function public.notify_on_follow_relationship();
  end if;
end
$$;

-- Registration RPC serializes endpoint ownership so one signed-in account cannot
-- steal another account's subscription by racing an upsert for the same endpoint.
create or replace function public.register_push_subscription(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_user uuid;
  v_subscription_id uuid;
  v_subscription_count integer;
  v_existing_found boolean := false;
begin
  if p_user_id is null or p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 2048
     or p_p256dh is null or char_length(p_p256dh) not between 20 and 512
     or p_auth_secret is null or char_length(p_auth_secret) not between 8 and 256 then
    raise exception 'Invalid push subscription.' using errcode='22023';
  end if;

  -- Lock both endpoint ownership and the account's subscription quota.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_endpoint, 601213));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 601214));
  select s.user_id into v_existing_user from public.push_subscriptions s where s.endpoint=p_endpoint for update;
  v_existing_found := found;
  if v_existing_found and v_existing_user <> p_user_id then
    raise exception 'Push endpoint already belongs to another account.' using errcode='42501';
  end if;

  select count(*) into v_subscription_count from public.push_subscriptions s where s.user_id=p_user_id;
  if not v_existing_found and v_subscription_count >= 10 then
    raise exception 'Too many push subscriptions for this account.' using errcode='22023';
  end if;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth_secret, updated_at, last_seen_at)
  values (p_user_id, p_endpoint, p_p256dh, p_auth_secret, now(), now())
  on conflict (endpoint) do update set
    p256dh=excluded.p256dh,
    auth_secret=excluded.auth_secret,
    updated_at=now(),
    last_seen_at=now()
  where public.push_subscriptions.user_id=excluded.user_id
  returning id into v_subscription_id;

  if v_subscription_id is null then raise exception 'Push subscription registration failed.' using errcode='42501'; end if;
  return v_subscription_id;
end
$$;
revoke all on function public.register_push_subscription(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.register_push_subscription(uuid,text,text,text) to service_role;

create or replace function public.delete_push_subscription(p_user_id uuid, p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  if p_user_id is null or p_endpoint is null then raise exception 'Invalid push subscription.' using errcode='22023'; end if;
  delete from public.push_subscriptions where user_id=p_user_id and endpoint=p_endpoint;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end
$$;
revoke all on function public.delete_push_subscription(uuid,text) from public, anon, authenticated;
grant execute on function public.delete_push_subscription(uuid,text) to service_role;

create or replace function public.claim_push_notification_batches(p_limit integer default 50)
returns table (
  queue_id uuid,
  recipient_id uuid,
  group_key text,
  latest_notification_id uuid,
  activity_count integer,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
begin
  update public.push_notification_queue q
  set status='dead', locked_at=null, last_error='worker_lease_expired'
  where q.status='processing' and q.locked_at < now()-interval '10 minutes' and q.attempt_count >= 5;

  return query
  with picked as (
    select q.id from public.push_notification_queue q
    where q.attempt_count < 5 and (
      (q.status='pending' and q.deliver_after <= now())
      or (q.status='processing' and q.locked_at < now()-interval '10 minutes')
    )
    order by q.deliver_after asc, q.created_at asc
    for update skip locked
    limit v_limit
  )
  update public.push_notification_queue q
  set status='processing', locked_at=now(), attempt_count=q.attempt_count+1, updated_at=now()
  from picked where q.id=picked.id
  returning q.id, q.recipient_id, q.group_key, q.latest_notification_id, q.activity_count, q.attempt_count;
end
$$;
revoke all on function public.claim_push_notification_batches(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notification_batches(integer) to service_role;

create or replace function public.finish_push_notification_batch(
  p_queue_id uuid,
  p_outcome text,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.push_notification_queue%rowtype;
  v_pending_id uuid;
  v_pending_latest_at timestamptz;
  v_seconds integer;
begin
  if p_outcome not in ('sent','retry','failed') then raise exception 'Invalid push outcome.' using errcode='22023'; end if;
  select * into v_row from public.push_notification_queue where id=p_queue_id for update;
  if not found then return; end if;

  if p_outcome='sent' then
    update public.push_notification_queue set status='sent', sent_at=now(), locked_at=null, last_error=null, updated_at=now() where id=p_queue_id;
  elsif p_outcome='failed' or v_row.attempt_count >= 5 then
    update public.push_notification_queue set status='dead', locked_at=null, last_error=left(coalesce(p_error_code,'delivery_failed'),200), updated_at=now() where id=p_queue_id;
  else
    v_seconds := case when v_row.attempt_count <= 1 then 30 when v_row.attempt_count=2 then 120 when v_row.attempt_count=3 then 300 else 600 end;
    select q.id, q.last_activity_at into v_pending_id, v_pending_latest_at
    from public.push_notification_queue q
    where q.recipient_id=v_row.recipient_id and q.group_key=v_row.group_key and q.status='pending'
    order by q.first_activity_at asc limit 1 for update;

    if v_pending_id is not null then
      update public.push_notification_queue q set
        activity_count=q.activity_count + v_row.activity_count,
        first_activity_at=least(q.first_activity_at,v_row.first_activity_at),
        last_activity_at=greatest(q.last_activity_at,v_row.last_activity_at),
        latest_notification_id=case when v_row.last_activity_at > v_pending_latest_at then v_row.latest_notification_id else q.latest_notification_id end,
        deliver_after=greatest(q.deliver_after, now()+make_interval(secs=>v_seconds)),
        last_error=left(coalesce(p_error_code,'temporary_delivery_failure'),200),
        updated_at=now()
      where q.id=v_pending_id;

      -- Carry per-device receipts to the merged queue ID. Without this transfer,
      -- a device that accepted the earlier batch would be sent the same grouped
      -- alert again after another device's transient failure.
      insert into public.push_delivery_receipts
        (queue_id, subscription_id, state, attempts, last_error, delivered_at, updated_at)
      select v_pending_id, r.subscription_id, r.state, r.attempts, r.last_error, r.delivered_at, now()
      from public.push_delivery_receipts r
      where r.queue_id=p_queue_id
      on conflict (queue_id, subscription_id) do update set
        state = case
          when public.push_delivery_receipts.state='delivered' or excluded.state='delivered' then 'delivered'
          when public.push_delivery_receipts.state='expired' or excluded.state='expired' then 'expired'
          when public.push_delivery_receipts.state='permanent_failure' or excluded.state='permanent_failure' then 'permanent_failure'
          else 'retryable_failure'
        end,
        attempts = greatest(public.push_delivery_receipts.attempts, excluded.attempts),
        last_error = case
          when public.push_delivery_receipts.state='delivered' or excluded.state='delivered' then null
          else coalesce(excluded.last_error, public.push_delivery_receipts.last_error)
        end,
        delivered_at = coalesce(public.push_delivery_receipts.delivered_at, excluded.delivered_at),
        updated_at = now();

      update public.push_notification_queue set status='superseded', locked_at=null, updated_at=now() where id=p_queue_id;
    else
      update public.push_notification_queue set status='pending', locked_at=null,
        deliver_after=now()+make_interval(secs=>v_seconds),
        last_error=left(coalesce(p_error_code,'temporary_delivery_failure'),200), updated_at=now()
      where id=p_queue_id;
    end if;
  end if;
end
$$;
revoke all on function public.finish_push_notification_batch(uuid,text,text) from public, anon, authenticated;
grant execute on function public.finish_push_notification_batch(uuid,text,text) to service_role;

-- Add the table to Supabase Postgres Changes where that standard publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

commit;
