import { supabase } from "./client";
import { validateContentReportDraft } from "../../utils/contentSafetyRules";

function throwSafetyError(error) {
  if (!error) return;
  if (error.code === "23505") {
    throw new Error("You've already submitted a report for this item, or this action is already in place.");
  }
  if (["23514", "P0001", "42501"].includes(error.code)) {
    throw new Error(error.message || "Campus Connect couldn't accept that action.");
  }
  throw error;
}

export async function submitContentReport({ targetType, targetId, reason, details = "" }) {
  if (!targetId) throw new Error("The item to report could not be identified.");
  const draft = validateContentReportDraft({ targetType, reason, details });
  const { error } = await supabase.from("content_reports").insert({
    target_type: draft.targetType,
    target_id: targetId,
    reason: draft.reason,
    details: draft.details,
  });
  throwSafetyError(error);
}

export async function hidePost(postId) {
  if (!postId) throw new Error("The post could not be identified.");
  const { error } = await supabase.from("hidden_posts").insert({ post_id: postId });
  if (error?.code === "23505") return;
  throwSafetyError(error);
}

export async function blockUser(userId) {
  if (!userId) throw new Error("The account could not be identified.");
  const { error } = await supabase.from("blocked_users").insert({ blocked_id: userId });
  if (error?.code === "23505") return;
  throwSafetyError(error);
}

export async function unblockUser(userId) {
  if (!userId) throw new Error("The account could not be identified.");
  const { error } = await supabase.from("blocked_users").delete().eq("blocked_id", userId);
  throwSafetyError(error);
}

export async function listMyBlockedAccounts() {
  const { data, error } = await supabase.rpc("list_my_blocked_accounts");
  throwSafetyError(error);
  return data || [];
}

export async function isContentModerator() {
  const { data, error } = await supabase.rpc("is_content_moderator");
  throwSafetyError(error);
  return data === true;
}

export async function listContentReports({ status = null, offset = 0, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const { data, error } = await supabase.rpc("list_content_reports", {
    p_status: status,
    p_limit: safeLimit,
    p_offset: safeOffset,
  });
  throwSafetyError(error);
  return data || [];
}

export async function reviewContentReport({ reportId, source, status, notes = "" }) {
  if (!reportId || !["content", "marketplace_listing"].includes(source)) {
    throw new Error("The report could not be identified.");
  }
  if (!["under_review", "actioned", "dismissed"].includes(status)) {
    throw new Error("Choose a valid moderation action.");
  }
  const trimmedNotes = String(notes).trim();
  if (trimmedNotes.length > 1000) throw new Error("Moderation notes must be 1,000 characters or fewer.");
  const { data, error } = await supabase.rpc("review_content_report", {
    p_report_id: reportId,
    p_source: source,
    p_status: status,
    p_notes: trimmedNotes || null,
  });
  throwSafetyError(error);
  return data === true;
}
