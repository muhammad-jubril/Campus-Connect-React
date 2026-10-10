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

export function resetPasswordForEmail(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: getResetRedirectUrl() });
}

export function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}
