-- Forward-only hardening for projects that already applied an earlier version
-- of the Marketplace beta migration. Do not rely on re-running an edited
-- migration file: update the trigger execution context explicitly instead.
begin;

do $$
begin
  if to_regprocedure('public.enforce_marketplace_listing_rules()') is null then
    raise exception 'Marketplace trigger hardening stopped: apply the Marketplace beta migration first.';
  end if;
  if to_regprocedure('public.validate_marketplace_report()') is null then
    raise exception 'Marketplace trigger hardening stopped: apply the Marketplace beta migration first.';
  end if;
end
$$;

-- These trigger functions perform required cross-row quota/report checks after
-- API table privileges have been narrowed to safe columns. Run under the
-- trusted migration/table owner's privileges, with a blank search_path and
-- schema-qualified references in the function body. Trigger execution does
-- not require API callers to have EXECUTE on the trigger functions.
alter function public.enforce_marketplace_listing_rules() security definer;
alter function public.enforce_marketplace_listing_rules() set search_path = '';
alter function public.validate_marketplace_report() security definer;
alter function public.validate_marketplace_report() set search_path = '';

revoke all on function public.enforce_marketplace_listing_rules() from public, anon, authenticated;
revoke all on function public.validate_marketplace_report() from public, anon, authenticated;

commit;
