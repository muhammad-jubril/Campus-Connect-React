-- Beta media policy: image-only uploads, four feed images, and 500-character posts.
-- Existing storage objects and legacy video rows are preserved.
begin;

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'post-media';

create or replace function public.enforce_beta_post_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.text is not null and char_length(new.text) > 500 then
    raise exception 'Post text must be 500 characters or fewer' using errcode = '23514';
  end if;

  if nullif(btrim(coalesce(new.text, '')), '') is null
     and coalesce(cardinality(new.media_urls), 0) = 0 then
    raise exception 'A post must contain text or at least one image' using errcode = '23514';
  end if;

  -- Existing video records can still have their text edited. Media rules apply
  -- only when a row is inserted or its media fields change.
  if tg_op = 'INSERT' then
    if new.media_type = 'video' then
      raise exception 'Video uploads are not supported in the beta' using errcode = '23514';
    end if;
    if new.media_type is not null and new.media_type <> 'image' then
      raise exception 'Unsupported post media type' using errcode = '23514';
    end if;
    if new.media_type = 'image' then
      if coalesce(cardinality(new.media_urls), 0) < 1 or coalesce(cardinality(new.media_urls), 0) > 4 then
        raise exception 'Image posts must contain between one and four images' using errcode = '23514';
      end if;
    elsif coalesce(cardinality(new.media_urls), 0) > 0 then
      raise exception 'Post images require media_type=image' using errcode = '23514';
    end if;
  elsif new.media_type is distinct from old.media_type or new.media_urls is distinct from old.media_urls then
    if new.media_type = 'video' then
      raise exception 'Video uploads are not supported in the beta' using errcode = '23514';
    end if;
    if new.media_type is not null and new.media_type <> 'image' then
      raise exception 'Unsupported post media type' using errcode = '23514';
    end if;
    if new.media_type = 'image' then
      if coalesce(cardinality(new.media_urls), 0) < 1 or coalesce(cardinality(new.media_urls), 0) > 4 then
        raise exception 'Image posts must contain between one and four images' using errcode = '23514';
      end if;
    elsif coalesce(cardinality(new.media_urls), 0) > 0 then
      raise exception 'Post images require media_type=image' using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists posts_enforce_beta_post_rules on public.posts;
create trigger posts_enforce_beta_post_rules
before insert or update on public.posts
for each row execute function public.enforce_beta_post_rules();

revoke all on function public.enforce_beta_post_rules() from public, anon, authenticated;

commit;
