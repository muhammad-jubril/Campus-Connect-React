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

// The reset-password email's link has to point somewhere reachable later.
// If requested from a local dev server, fall back to the real deployed
// site — a localhost link is useless to anyone but the machine that sent it.
const PRODUCTION_URL = "https://campus-connect-224y.vercel.app/";
export function getResetRedirectUrl() {
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  return isLocal ? PRODUCTION_URL : window.location.origin + "/reset-password";
}

export function resetPasswordForEmail(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: getResetRedirectUrl() });
}

export function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}
