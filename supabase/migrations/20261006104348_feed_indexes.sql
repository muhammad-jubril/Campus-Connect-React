-- Indexes for the queries the app actually runs (foreign keys had none).
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx on public.posts (author_id, created_at desc);
create index if not exists comments_post_id_idx on public.comments (post_id, created_at);
create index if not exists comments_author_id_idx on public.comments (author_id);
create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists notifications_post_id_idx on public.notifications (post_id);
