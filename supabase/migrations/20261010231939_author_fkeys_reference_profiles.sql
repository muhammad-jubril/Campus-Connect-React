-- Root cause of "Couldn't load this post / these posts / replies": the app embeds
-- profiles!posts_author_id_fkey(username) and profiles!comments_author_id_fkey(username),
-- but those constraints referenced auth.users, so PostgREST returned 400 PGRST200 (no relationship).
-- Same constraint names, now referencing public.profiles(id). Cascade chain is unchanged:
-- auth.users -> profiles -> posts/comments.
alter table public.posts drop constraint posts_author_id_fkey;
alter table public.posts add constraint posts_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.comments drop constraint comments_author_id_fkey;
alter table public.comments add constraint comments_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete cascade;

notify pgrst, 'reload schema';
