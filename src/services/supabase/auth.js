import { supabase } from "./client";

export function signUp({ email, password, username }) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
}

export function verifySignupOtp({ email, token }) {
  return supabase.auth.verifyOtp({ email, token, type: "signup" });
}

export function resendSignupOtp(email) {
  return supabase.auth.resend({ type: "signup", email });
}

// Check address availability before the signup flow advances past Step 2.
// This deliberately returns only the availability boolean; the Edge Function
// owns normalization, account lookup and server-side rate limiting.
export async function checkSignupEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const { data, error } = await supabase.functions.invoke("check-signup-email", {
    body: { email: normalizedEmail },
  });

  if (!error) {
    if (typeof data?.available !== "boolean") {
      const invalidResponse = new Error("Unexpected email-check response");
      invalidResponse.code = "invalid_response";
      throw invalidResponse;
    }
    return data;
  }

  let responseBody = null;
  try {
    if (error.context && typeof error.context.json === "function") {
      responseBody = await error.context.json();
    }
  } catch {
    // A network error or non-JSON response has no structured body.
  }

  const response = error.context;
  const retryAfterHeader = response?.headers?.get?.("Retry-After");
  const parsedError = new Error(responseBody?.error || error.message || "Email check failed");
  parsedError.code = responseBody?.error || (
    error.name === "FunctionsFetchError" ? "network_error" : "server_error"
  );
  parsedError.status = response?.status || 0;
  parsedError.retryAfterSeconds = Math.max(
    0,
    Number(responseBody?.retry_after_seconds ?? retryAfterHeader ?? 0) || 0
  );
  throw parsedError;
}

export function signInWithPassword({ email, password }) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut(options) {
  return supabase.auth.signOut(options);
}

export function getSession() {
  return supabase.auth.getSession();
}

export function getUser() {
  return supabase.auth.getUser();
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}

// Use VITE_SITE_URL when explicitly configured; otherwise target this exact
// deployment origin so development and preview builds don't redirect to prod.
export function getResetRedirectUrl() {
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const configuredSiteUrl = (import.meta.env.VITE_SITE_URL || currentOrigin)
    .trim()
    .replace(/\/+$/, "");

  if (!configuredSiteUrl) {
    throw new Error("Set VITE_SITE_URL to build a password-reset redirect URL outside the browser.");
  }

  return `${configuredSiteUrl}/reset-password`;
}

// The Supabase "Reset Password" email template must render {{ .Token }} so
// this request delivers the six-digit recovery code used by the OTP screen.
export function resetPasswordForEmail(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: getResetRedirectUrl() });
}

export function verifyRecoveryOtp({ email, token }) {
  return supabase.auth.verifyOtp({ email, token, type: "recovery" });
}

export function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}
