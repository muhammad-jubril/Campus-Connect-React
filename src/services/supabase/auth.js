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

export function signOut() {
  return supabase.auth.signOut();
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

// Password-reset links must point at the deployed application's reset route.
// VITE_SITE_URL is set independently per environment; the fallback keeps the
// current production deployment working until the variable is configured.
const DEFAULT_SITE_URL = "https://campus-connect-224y.vercel.app";

export function getResetRedirectUrl() {
  const configuredSiteUrl = (import.meta.env.VITE_SITE_URL || DEFAULT_SITE_URL).trim().replace(/\/+$/, "");
  return `${configuredSiteUrl}/reset-password`;
}

export function resetPasswordForEmail(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: getResetRedirectUrl() });
}

export function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}
