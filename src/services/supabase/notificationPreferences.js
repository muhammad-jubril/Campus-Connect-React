import { supabase } from "./client";

const TABLE = "notification_preferences";
const COLUMNS = "user_id,push_likes,push_comments,push_replies,push_follows,updated_at";
const PREFERENCE_FIELDS = Object.freeze([
  "push_likes",
  "push_comments",
  "push_replies",
  "push_follows",
]);

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  push_likes: true,
  push_comments: true,
  push_replies: true,
  push_follows: true,
});

function throwPreferenceError(error) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205") {
    throw new Error("Notification preferences are not available on the backend yet. Apply the Settings preferences migration and try again.");
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    throw new Error("You don't have permission to update these notification preferences. Refresh your session and try again.");
  }
  throw error;
}

async function readPreferences(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  throwPreferenceError(error);
  return data;
}

/** Load persisted preferences, creating the user's default row when necessary. */
export async function loadNotificationPreferences(userId) {
  if (!userId) throw new Error("Sign in to manage notification preferences.");

  const existing = await readPreferences(userId);
  if (existing) return existing;

  // user_id is deliberately omitted. PostgreSQL derives it from auth.uid().
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...DEFAULT_NOTIFICATION_PREFERENCES })
    .select(COLUMNS)
    .single();

  if (!error && data) return data;
  if (error?.code === "23505") {
    // Another tab may have initialized the row concurrently.
    const raced = await readPreferences(userId);
    if (raced) return raced;
  }
  throwPreferenceError(error);
  throw new Error("Notification preferences could not be initialized. Try again.");
}

/** Persist a boolean category preference and return the saved server row. */
export async function updateNotificationPreference(userId, field, value) {
  if (!userId) throw new Error("Sign in to change notification preferences.");
  if (!PREFERENCE_FIELDS.includes(field) || typeof value !== "boolean") {
    throw new Error("Choose a valid notification preference.");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ [field]: value })
    .eq("user_id", userId)
    .select(COLUMNS)
    .maybeSingle();
  throwPreferenceError(error);
  if (!data) throw new Error("The saved preference row could not be found. Refresh settings and try again.");
  return data;
}
