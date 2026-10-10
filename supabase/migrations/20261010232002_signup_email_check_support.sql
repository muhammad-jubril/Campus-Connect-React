-- Support objects for the check-signup-email Edge Function. Callable ONLY by service_role.

-- 1. Private schema + rate-limit counter (not exposed through the REST API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
alter table private.rate_limits enable row level security;
revoke all on table private.rate_limits from public, anon, authenticated;

-- 2. Atomic fixed-window rate limit (one row per key; the upsert locks the row, so concurrent calls count correctly)
create or replace function public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hits integer;
  v_start timestamptz;
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => p_window_seconds);
begin
  if p_key is null or length(p_key) > 200 or p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    hits = case when r.window_start <= v_now - v_window then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= v_now - v_window then v_now else r.window_start end
  returning r.hits, r.window_start into v_hits, v_start;

  -- opportunistic cleanup (about 1% of calls) so the table stays tiny on the free plan
  if random() < 0.01 then
    delete from private.rate_limits where window_start < v_now - interval '1 day';
  end if;

  allowed := v_hits <= p_max;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_start + v_window - v_now)))::integer)
  end;
  return next;
end
$$;

-- 3. Email availability: true when no CONFIRMED account uses this email.
--    Indexed equality lookup on auth.users.email (O(log n)); never scans or lists users.
--    Unconfirmed (abandoned) signups count as available so a student can restart signup.
create or replace function public.signup_email_available(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from auth.users u
    where u.email = lower(btrim(p_email))
      and u.email_confirmed_at is not null
  )
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
revoke all on function public.signup_email_available(text) from public, anon, authenticated;
grant execute on function public.signup_email_available(text) to service_role;
