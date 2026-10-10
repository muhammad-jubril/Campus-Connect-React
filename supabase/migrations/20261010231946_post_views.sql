-- Count unique authenticated accounts that have opened an individual post.
-- Viewer identities remain private: clients cannot query this table directly;
-- the RPC returns only the aggregate count for one post.

create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);

alter table public.post_views enable row level security;
revoke all on table public.post_views from public, anon, authenticated;

create or replace function public.record_post_view(p_post_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_view_count bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
  ) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  insert into public.post_views (post_id, viewer_id)
  values (p_post_id, v_uid)
  on conflict (post_id, viewer_id) do nothing;

  select count(*)
  into v_view_count
  from public.post_views pv
  where pv.post_id = p_post_id;

  return coalesce(v_view_count, 0);
end;
$$;

revoke all on function public.record_post_view(uuid) from public, anon;
grant execute on function public.record_post_view(uuid) to authenticated;
