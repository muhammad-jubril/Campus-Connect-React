-- Transactional live smoke test for follow operations.
-- Run as the Supabase postgres role after applying the follow RPC migration.
-- Needs two subscribed profiles with an unused follow direction and no active block.
-- All created relationships, block rows, notifications and queue rows are rolled back.
BEGIN;
DO $follow_smoke$
DECLARE
  v_actor uuid;
  v_target uuid;
  v_created boolean;
  v_repeated boolean;
  v_unfollowed boolean;
  v_unfollow_repeated boolean;
  v_relationship_id uuid;
  v_notification_count bigint;
  v_counts record;
  v_expected_followers bigint;
  v_expected_following bigint;
  v_list_has_actor boolean;
  v_list_has_target boolean;
  v_rejected boolean;
BEGIN
  SELECT actor.user_id, target.user_id
  INTO v_actor, v_target
  FROM public.push_subscriptions actor
  JOIN public.push_subscriptions target ON target.user_id <> actor.user_id
  WHERE NOT EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = actor.user_id AND f.following_id = target.user_id
    )
    AND NOT public.is_notification_pair_blocked(actor.user_id, target.user_id)
  ORDER BY actor.created_at, target.created_at
  LIMIT 1;

  IF v_actor IS NULL OR v_target IS NULL THEN
    RAISE EXCEPTION 'Need two registered test profiles with an unblocked, unused follow direction';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);

  v_created := public.follow_student(v_target);
  IF v_created IS DISTINCT FROM true THEN RAISE EXCEPTION 'First follow call must create the relationship'; END IF;

  SELECT f.id INTO v_relationship_id FROM public.follows f
  WHERE f.follower_id = v_actor AND f.following_id = v_target;
  IF v_relationship_id IS NULL THEN RAISE EXCEPTION 'Relationship row was not created'; END IF;

  SELECT count(*) INTO v_notification_count FROM public.notifications n
  WHERE n.recipient_id = v_target AND n.actor_id = v_actor
    AND n.type = 'follow' AND n.source_id = v_relationship_id;
  IF v_notification_count <> 1 THEN RAISE EXCEPTION 'Expected exactly one follow notification, found %', v_notification_count; END IF;

  v_repeated := public.follow_student(v_target);
  IF v_repeated IS DISTINCT FROM false THEN RAISE EXCEPTION 'Repeated follow must return false'; END IF;
  SELECT count(*) INTO v_notification_count FROM public.notifications n
  WHERE n.recipient_id = v_target AND n.actor_id = v_actor
    AND n.type = 'follow' AND n.source_id = v_relationship_id;
  IF v_notification_count <> 1 THEN RAISE EXCEPTION 'Repeated follow duplicated the notification'; END IF;

  SELECT * INTO v_counts FROM public.get_follow_counts(v_target);
  SELECT count(*) INTO v_expected_followers FROM public.follows f
  WHERE f.following_id = v_target AND NOT public.is_notification_pair_blocked(f.follower_id, f.following_id);
  SELECT count(*) INTO v_expected_following FROM public.follows f
  WHERE f.follower_id = v_target AND NOT public.is_notification_pair_blocked(f.follower_id, f.following_id);
  IF v_counts.followers_count <> v_expected_followers OR v_counts.following_count <> v_expected_following
     OR v_counts.is_followed_by IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Follow counts/status are inaccurate';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.get_following(v_actor, 100, 0) f WHERE f.id = v_target) INTO v_list_has_target;
  SELECT EXISTS(SELECT 1 FROM public.get_followers(v_target, 100, 0) f WHERE f.id = v_actor) INTO v_list_has_actor;
  IF NOT v_list_has_target OR NOT v_list_has_actor THEN RAISE EXCEPTION 'Follower/following RPC missed the relationship'; END IF;

  v_rejected := false;
  BEGIN PERFORM public.follow_student(v_actor);
  EXCEPTION WHEN SQLSTATE '23514' THEN v_rejected := true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Self-follow should be rejected'; END IF;

  INSERT INTO public.blocked_users (blocker_id, blocked_id) VALUES (v_actor, v_target);
  v_rejected := false;
  BEGIN PERFORM public.follow_student(v_target);
  EXCEPTION WHEN SQLSTATE '42501' THEN v_rejected := true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Blocked follow should be rejected'; END IF;

  v_unfollowed := public.unfollow_student(v_target);
  v_unfollow_repeated := public.unfollow_student(v_target);
  IF v_unfollowed IS DISTINCT FROM true OR v_unfollow_repeated IS DISTINCT FROM false THEN RAISE EXCEPTION 'Unfollow idempotency failed'; END IF;

  SELECT count(*) INTO v_notification_count FROM public.notifications n
  WHERE n.recipient_id = v_target AND n.actor_id = v_actor
    AND n.type = 'follow' AND n.source_id = v_relationship_id;
  IF v_notification_count <> 1 THEN RAISE EXCEPTION 'Unfollow created/duplicated a notification'; END IF;

  IF has_column_privilege('authenticated', 'public.follows', 'following_id', 'INSERT')
     OR has_table_privilege('authenticated', 'public.follows', 'DELETE') THEN
    RAISE EXCEPTION 'Direct authenticated write privileges remain on follows';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.follow_student(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_followers(uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.follow_student(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Follow RPC grants are incorrect';
  END IF;
  RAISE NOTICE 'Follow smoke checks passed; test data rolls back.';
END
$follow_smoke$;
ROLLBACK;
