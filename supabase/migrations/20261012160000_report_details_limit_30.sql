-- Enforce the 30-character report-details limit for new/edited content and
-- Marketplace reports without destroying longer evidence captured historically.
-- Existing records with longer details remain reviewable: updating report status
-- does not revalidate details unless the details field itself is changed.
begin;

do $$
begin
  if to_regclass('public.content_reports') is null then
    raise exception 'Report-details limit migration stopped: public.content_reports is missing. Apply the content-safety migration first.';
  end if;
  if to_regclass('public.marketplace_reports') is null then
    raise exception 'Report-details limit migration stopped: public.marketplace_reports is missing. Apply the Marketplace migration first.';
  end if;
end
$$;

create or replace function public.enforce_report_details_limit_30()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.details is distinct from old.details then
    new.details := nullif(btrim(new.details), '');
    if new.details is not null and char_length(new.details) > 30 then
      raise exception 'Report details must be 30 characters or fewer.' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.enforce_report_details_limit_30() from public, anon, authenticated;

drop trigger if exists content_reports_zz_details_limit on public.content_reports;
create trigger content_reports_zz_details_limit
before insert or update on public.content_reports
for each row execute function public.enforce_report_details_limit_30();

drop trigger if exists marketplace_reports_zz_details_limit on public.marketplace_reports;
create trigger marketplace_reports_zz_details_limit
before insert or update on public.marketplace_reports
for each row execute function public.enforce_report_details_limit_30();

commit;
