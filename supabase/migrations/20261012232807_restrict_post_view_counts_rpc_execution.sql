-- Tighten the post-view aggregate RPC ACL after checking the live default grants.
-- The RPC is intended for authenticated app users only, not anon or service_role.
BEGIN;

REVOKE ALL ON FUNCTION public.get_post_view_counts(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_post_view_counts(uuid[]) TO authenticated;

COMMIT;
