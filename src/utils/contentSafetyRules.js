export const MAX_CONTENT_REPORT_DETAILS = 800;

const COMMON_REASONS = Object.freeze([
  { value: "harassment_bullying", label: "Harassment or bullying" },
  { value: "hate_discrimination", label: "Hate or discrimination" },
  { value: "threats_violence", label: "Threats or violence" },
  { value: "spam_scams", label: "Spam or scams" },
  { value: "sexual_inappropriate", label: "Sexual or inappropriate content" },
  { value: "false_misleading", label: "False or misleading information" },
  { value: "other", label: "Other" },
]);

export const REPORT_REASONS = Object.freeze({
  post: COMMON_REASONS,
  comment: COMMON_REASONS,
  reply: COMMON_REASONS,
  account: Object.freeze([
    ...COMMON_REASONS.filter((reason) => reason.value !== "false_misleading"),
    { value: "impersonation", label: "Impersonation" },
    { value: "false_misleading", label: "False or misleading information" },
  ]),
});

export const REPORT_TARGET_TYPES = Object.freeze(["post", "account", "comment", "reply"]);

export function validateContentReportDraft({ targetType, reason, details = "" }) {
  if (!REPORT_TARGET_TYPES.includes(targetType)) {
    throw new Error("Choose a valid item to report.");
  }
  if (!REPORT_REASONS[targetType].some((option) => option.value === reason)) {
    throw new Error("Choose a reason that applies to this report.");
  }
  if (typeof details !== "string") {
    throw new Error("Report details must be text.");
  }
  if (details.length > MAX_CONTENT_REPORT_DETAILS) {
    throw new Error(`Report details must be ${MAX_CONTENT_REPORT_DETAILS} characters or fewer.`);
  }
  return { targetType, reason, details: details.trim() || null };
}

export function isBlockPair(blocks, firstUserId, secondUserId) {
  if (!firstUserId || !secondUserId || firstUserId === secondUserId) return false;
  return blocks.some((block) => (
    (block.blocker_id === firstUserId && block.blocked_id === secondUserId)
    || (block.blocker_id === secondUserId && block.blocked_id === firstUserId)
  ));
}
