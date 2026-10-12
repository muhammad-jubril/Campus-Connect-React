const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205"]);
const MISSING_RPC_CODES = new Set(["PGRST202", "42883"]);
const FOLLOW_RPC_NAMES = "follow_student|unfollow_student|get_follow_counts|get_followers|get_following";

/** Convert missing backend schema/RPCs and permission failures into actionable messages. */
export function normalizeFollowError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");

  if (
    MISSING_RELATION_CODES.has(code) ||
    /relation\s+["']?public\.(follows|follow_relationships)["']?\s+does not exist/i.test(message) ||
    /could not find the table\s+["']?public\.(follows|follow_relationships)/i.test(message)
  ) {
    return new Error(
      "Followers and following aren't available yet. Deploy the follow relationship table and its security policies first."
    );
  }

  if (
    MISSING_RPC_CODES.has(code) ||
    new RegExp(`could not find the function\\s+["']?public\\.(${FOLLOW_RPC_NAMES})`, "i").test(message)
  ) {
    return new Error(
      "Followers and following need the latest backend migration. Deploy the follow operations RPCs before using this feature."
    );
  }

  if (code === "42501" && /row-level security|permission denied|not authorized/i.test(message)) {
    return new Error("This follow action isn't allowed. Check the account's privacy and blocking restrictions.");
  }

  if (code === "42501" || code === "P0001" || code === "23514" || code === "23503") {
    return new Error(
      message || "This follow action isn't allowed. Check the account's privacy and blocking restrictions."
    );
  }

  if (error instanceof Error) return error;
  return new Error(message || "Couldn't load follow information. Check your connection and try again.");
}
