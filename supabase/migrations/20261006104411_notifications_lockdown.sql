-- Closes the spoofing hole: clients can no longer insert notifications at all,
-- and recipients can only flip `read` (not rewrite actor/type/post).
-- Run right after 20261006100001 (and after the app no longer inserts them).
begin;

drop policy if exists notifications_insert_as_self on public.notifications;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in ('like', 'comment'));

revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

commit;
