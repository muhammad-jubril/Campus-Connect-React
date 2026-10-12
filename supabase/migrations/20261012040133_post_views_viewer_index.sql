-- Cover the viewer-side FK for profile/account deletion and viewer-scoped lookups.
-- The existing primary key (post_id, viewer_id) cannot efficiently cover viewer_id alone.
begin;

create index if not exists post_views_viewer_id_idx
  on public.post_views (viewer_id);

commit;
