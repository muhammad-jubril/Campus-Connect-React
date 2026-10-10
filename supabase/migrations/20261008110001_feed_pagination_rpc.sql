-- Applied live (Claude, Supabase connector). Feed pagination RPC for frontend task P2-3.
-- Keyset (cursor) pagination over posts, newest first, ties broken by id.
-- SECURITY INVOKER: runs with the caller's RLS; returns only the author's username from profiles.

-- Keyset pagination needs the (created_at, id) pair indexed in the same order as the query.
create index if not exists posts_feed_cursor_idx on public.posts (created_at desc, id desc);

create or replace function public.get_feed_posts(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  author_id uuid,
  author_username text,
  text text,
  media_type text,
  media_urls text[],
  created_at timestamptz,
  edited_at timestamptz,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'p_before_created_at and p_before_id must be provided together' using errcode = '22023';
  end if;

  return query
  with page as (
    select p.id, p.author_id, p.text, p.media_type, p.media_urls, p.created_at, p.edited_at
    from public.posts p
    where p_before_created_at is null
       or (p.created_at, p.id) < (p_before_created_at, p_before_id)
    order by p.created_at desc, p.id desc
    limit v_limit
  )
  select
    pg.id,
    pg.author_id,
    pr.username,
    pg.text,
    pg.media_type,
    pg.media_urls,
    pg.created_at,
    pg.edited_at,
    (select count(*) from public.likes l where l.post_id = pg.id),
    (select count(*) from public.comments c where c.post_id = pg.id),
    exists (select 1 from public.likes l2 where l2.post_id = pg.id and l2.user_id = v_uid)
  from page pg
  left join public.profiles pr on pr.id = pg.author_id
  order by pg.created_at desc, pg.id desc;
end
$$;

revoke all on function public.get_feed_posts(integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_feed_posts(integer, timestamptz, uuid) to authenticated;