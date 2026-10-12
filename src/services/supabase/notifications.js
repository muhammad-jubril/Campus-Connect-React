import { supabase } from "./client";

const NOTIFICATIONS_TABLE = "notifications";
const ACTOR_COLUMNS = "id,username,name,avatar_url";

/**
 * Reads the existing notifications table. The UI groups these returned activity
 * rows for presentation only; it never combines or deletes their database IDs.
 *
 * Reply/follow rows may include comment_id, thread_id, profile_id or target_id
 * once the backend adds those fields. select("*") allows the frontend to consume
 * those additions without introducing a second client-side schema.
 */
export async function fetchNotifications(userId, limit = 100) {
  if (!userId) return [];

  const { data: rows, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 200));

  if (error) throw error;
  const notifications = rows || [];
  const actorIds = [...new Set(notifications.map((row) => row.actor_id).filter(Boolean))];
  let actorsById = new Map();

  if (actorIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select(ACTOR_COLUMNS)
      .in("id", actorIds);

    if (profilesError) {
      // Keep the activity visible if public profile metadata is unavailable.
      console.warn("Notification actor profiles could not be loaded:", profilesError);
    } else {
      actorsById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    }
  }

  return notifications.map((row) => ({
    ...row,
    read: Boolean(row.read),
    actor: actorsById.get(row.actor_id) || {
      id: row.actor_id || null,
      username: row.actor_username || null,
      name: row.actor_name || row.actor_username || "A student",
      avatar_url: row.actor_avatar_url || null,
    },
  }));
}

export async function fetchUnreadNotificationCount(userId) {
  if (!userId) return 0;

  const { count, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .eq("read", false);

  if (error) throw error;
  return Number(count) || 0;
}

export async function markNotificationRead(notificationId, userId) {
  if (!notificationId || !userId) throw new Error("The notification could not be identified.");

  const { error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .update({ read: true })
    .eq("id", notificationId)
    .eq("recipient_id", userId)
    .eq("read", false);

  if (error) throw error;
}

export async function markNotificationsRead(notificationIds, userId) {
  const ids = [...new Set((notificationIds || []).filter(Boolean))];
  if (!ids.length) return;
  if (!userId) throw new Error("Sign in to update your notifications.");

  const { error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .update({ read: true })
    .eq("recipient_id", userId)
    .eq("read", false)
    .in("id", ids);

  if (error) throw error;
}

export async function markAllNotificationsRead(userId) {
  if (!userId) throw new Error("Sign in to update your notifications.");

  const { error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .update({ read: true })
    .eq("recipient_id", userId)
    .eq("read", false);

  if (error) throw error;
}

/** Listen to rows belonging to one recipient; caller must remove the channel. */
export function subscribeToNotifications(userId, onChange, onStatus = () => {}) {
  if (!userId) return null;

  return supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: NOTIFICATIONS_TABLE,
        filter: `recipient_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe(onStatus);
}

export async function removeNotificationsChannel(channel) {
  if (channel) await supabase.removeChannel(channel);
}
