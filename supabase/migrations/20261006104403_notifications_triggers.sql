-- Notifications are created by the database, not by the client.
-- Run AFTER the React app stops calling notifyPostAuthor() (see README.md),
-- otherwise comment notifications will be created twice.
begin;

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;

  -- no self-notifications; no duplicate if someone likes/unlikes/likes again
  if v_author is not null
     and v_author <> new.user_id
     and not exists (
       select 1 from public.notifications n
       where n.recipient_id = v_author and n.actor_id = new.user_id
         and n.type = 'like' and n.post_id = new.post_id
     )
  then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (v_author, new.user_id, 'like', new.post_id);
  end if;

  return new;
end
$$;

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;

  if v_author is not null and v_author <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (v_author, new.author_id, 'comment', new.post_id);
  end if;

  return new;
end
$$;

-- Trigger functions must not be callable from the API.
revoke all on function public.notify_on_like() from public, anon, authenticated;
revoke all on function public.notify_on_comment() from public, anon, authenticated;

drop trigger if exists likes_notify on public.likes;
create trigger likes_notify
  after insert on public.likes
  for each row execute function public.notify_on_like();

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();

commit;
