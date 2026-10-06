const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);

let loggedRealAuthError = false;

function logRealAuthErrorOnce(error) {
  if (!import.meta.env.DEV || loggedRealAuthError || !error) return;
  loggedRealAuthError = true;
  console.log("Campus Connect Supabase auth error:", error);
}

export function classifyAuthError(error) {
  if (!error) return "unknown";

  logRealAuthErrorOnce(error);

  const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
  const name = typeof error.name === "string" ? error.name.toLowerCase() : "";
  const status = Number(error.status);

  if (name === "authretryablefetcherror" || status === 0) {
    return "network";
  }

  if (status === 429 || RATE_LIMIT_CODES.has(code)) {
    return "rate-limited";
  }

  if (code === "email_not_confirmed") {
    return "email-not-confirmed";
  }

  if (code === "invalid_credentials") {
    return "invalid-credentials";
  }

  return "unknown";
}
