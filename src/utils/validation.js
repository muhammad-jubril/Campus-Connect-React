export const USERNAME_RE = /^[a-zA-Z0-9_]{6,16}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "support",
  "help",
  "staff",
  "moderator",
  "mod",
  "official",
  "campusconnect",
  "campus_connect",
  "nwu",
  "security",
  "system",
  "root",
  "null",
  "undefined",
  "api",
  "www",
]);

export function isReservedUsername(username) {
  return RESERVED_USERNAMES.has(String(username || "").trim().toLowerCase());
}

export function checkPasswordRules(pw) {
  return { length: pw.length >= 8, lower: /[a-z]/.test(pw), upper: /[A-Z]/.test(pw), number: /[0-9]/.test(pw) };
}
export function isPasswordValid(pw) {
  return Object.values(checkPasswordRules(pw)).every(Boolean);
}

export function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
