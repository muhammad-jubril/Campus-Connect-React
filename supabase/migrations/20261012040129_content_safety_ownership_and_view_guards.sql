-- Forward-only correction for deployed content-safety migrations.
-- Comment/reply deletion is limited to the row's author. Post owners do not
-- gain permission to delete comments written by other accounts.
-- The post-view RPC is SECURITY DEFINER and therefore must repeat the same
-- blocked/hidden visibility checks that ordinary SELECT queries get from RLS.
begin;

do $$
declare
  p record;
begin
  -- Remove every DELETE policy, including legacy permissive policies: policies
  -- are OR-combined, so replacing only one named policy is insufficient.
  for p in
    select policyname
    from pg_policies
    where schemaname='public'
      and tablename='comments'
      and cmd='DELETE'
  loop
    execute format('drop policy if exists %I on public.comments', p.policyname);
  end loop;
end
$$;

create policy comments_delete_own on public.comments
  for delete to authenticated
  using (author_id=(select auth.uid()));

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

create or replace function public.record_post_view(p_post_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_id uuid;
  v_view_count bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select p.author_id into v_author_id
  from public.posts p
  where p.id = p_post_id;

  -- Use the same deliberately generic failure for missing, blocked, and
  -- locally hidden posts to avoid disclosing a hidden post's existence.
  if not found
     or public.is_user_blocked(v_author_id)
     or exists (
       select 1 from public.hidden_posts h
       where h.user_id = v_uid and h.post_id = p_post_id
     ) then
    raise exception 'Post not available' using errcode = 'P0002';
  end if;

  insert into public.post_views (post_id, viewer_id)
  values (p_post_id, v_uid)
  on conflict (post_id, viewer_id) do nothing;

  select count(*) into v_view_count
  from public.post_views pv
  where pv.post_id = p_post_id;

  return coalesce(v_view_count, 0);
end;
$$;

revoke all on function public.record_post_view(uuid) from public, anon;
grant execute on function public.record_post_view(uuid) to authenticated;

commit;
