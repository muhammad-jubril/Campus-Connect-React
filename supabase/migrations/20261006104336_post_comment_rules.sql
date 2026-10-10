-- Missing policies + input limits for posts and comments.
-- Limits must match the app: posts 600 chars (CreatePostPage MAX_CHARS), comments 500.
begin;

-- Shape / size limits
alter table public.posts drop constraint if exists posts_text_length;
alter table public.posts add constraint posts_text_length check (char_length(text) <= 600);

alter table public.posts drop constraint if exists posts_media_type_check;
alter table public.posts add constraint posts_media_type_check
  check (media_type is null or media_type in ('image', 'video'));

alter table public.posts drop constraint if exists posts_media_urls_max;
alter table public.posts add constraint posts_media_urls_max
  check (media_urls is null or array_length(media_urls, 1) <= 10);

alter table public.comments drop constraint if exists comments_text_length;
alter table public.comments add constraint comments_text_length
  check (char_length(btrim(text)) between 1 and 500);

-- Edit own post (text only) + "edited" marker
alter table public.posts add column if not exists edited_at timestamptz;

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

revoke update on public.posts from authenticated;
grant update (text) on public.posts to authenticated;

create or replace function public.set_post_edited_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.text is distinct from old.text then
    new.edited_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists posts_set_edited_at on public.posts;
create trigger posts_set_edited_at
  before update on public.posts
  for each row execute function public.set_post_edited_at();

-- Delete a comment: its author, or the author of the post it is on
drop policy if exists comments_delete_own_or_post_author on public.comments;
create policy comments_delete_own_or_post_author on public.comments
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or exists (
      select 1 from public.posts p
      where p.id = comments.post_id and p.author_id = (select auth.uid())
    )
  );

commit;
