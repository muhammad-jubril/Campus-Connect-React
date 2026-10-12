-- Expose aggregate post-view counts to authenticated clients without granting
-- SELECT access to post_views or disclosing viewer identities.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_post_view_counts(p_post_ids uuid[])
RETURNS TABLE (post_id uuid, view_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF COALESCE(pg_catalog.cardinality(p_post_ids), 0) > 100 THEN
    RAISE EXCEPTION 'At most 100 posts can be queried at once' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, count(pv.viewer_id)::bigint
  FROM public.posts p
  LEFT JOIN public.post_views pv ON pv.post_id = p.id
  WHERE p.id = ANY(COALESCE(p_post_ids, ARRAY[]::uuid[]))
    AND NOT public.is_user_blocked(p.author_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.hidden_posts h
      WHERE h.user_id = v_uid AND h.post_id = p.id
    )
  GROUP BY p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_post_view_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_post_view_counts(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_post_view_counts(uuid[]) IS
  'Returns aggregate unique-account view counts only for posts visible to the authenticated caller; never returns viewer IDs.';

COMMIT;
