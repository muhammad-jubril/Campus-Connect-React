-- Avoid an RLS cycle: posts visibility consults hidden_posts, so the
-- hidden_posts INSERT policy must not query public.posts itself.
-- Validate hide targets in a non-API trigger with a fixed search_path instead.
begin;

create or replace function public.validate_hidden_post_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select p.author_id
  into v_author_id
  from public.posts p
  where p.id = new.post_id;

  -- Keep missing, self-authored, and blocked posts indistinguishable.
  if not found
     or v_author_id = v_uid
     or public.is_user_blocked(v_author_id) then
    raise exception 'Post not available' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_hidden_post_target() from public, anon, authenticated;

drop trigger if exists hidden_posts_validate_target on public.hidden_posts;
create trigger hidden_posts_validate_target
before insert on public.hidden_posts
for each row execute function public.validate_hidden_post_target();

drop policy if exists hidden_posts_insert_own on public.hidden_posts;
create policy hidden_posts_insert_own
on public.hidden_posts
for insert to authenticated
with check (user_id = (select auth.uid()));

commit;
