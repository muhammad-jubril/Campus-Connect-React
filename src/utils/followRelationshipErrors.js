const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

/** Convert absent follow schema/RPCs into an actionable backend-integration message. */
export function normalizeFollowError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");

  if (
    MISSING_RELATION_CODES.has(code) ||
    /relation\s+["']?public\.(follows|follow_relationships)["']?\s+does not exist/i.test(message) ||
    /could not find the table\s+["']?public\.(follows|follow_relationships)/i.test(message)
  ) {
    return new Error(
      "Followers and following aren't available yet. The backend needs to deploy the follows table, row-level security policies, and required grants."
    );
  }

  if (code === "42501" && /row-level security|permission denied|not authorized/i.test(message)) {
    return new Error("This follow action isn't allowed. Check the account's privacy and blocking restrictions.");
  }

  if (code === "42501" || code === "P0001") {
    return new Error(
      message || "This follow action isn't allowed. Check the account's privacy and blocking restrictions."
    );
  }

  if (error instanceof Error) return error;
  return new Error(message || "Couldn't load follow information. Check your connection and try again.");
}
