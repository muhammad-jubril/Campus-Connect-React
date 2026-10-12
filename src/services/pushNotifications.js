import { supabase } from "./supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || "";
const PUSH_ENDPOINT = import.meta.env.VITE_PUSH_SUBSCRIPTION_ENDPOINT || "";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

// This endpoint receives the signed-in user's bearer token. Only send that token
// to the push-subscriptions function on the configured Supabase project; a typo
// or malicious build-time value must not exfiltrate it to an arbitrary host.
function isTrustedPushEndpoint(value = PUSH_ENDPOINT) {
  if (!value || !SUPABASE_URL) return false;
  try {
    const endpoint = new URL(value);
    const supabase = new URL(SUPABASE_URL);
    const expectedPath = "/functions/v1/push-subscriptions";
    const isSecure = endpoint.protocol === "https:" || (
      import.meta.env.DEV && endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname)
    );
    return isSecure && endpoint.origin === supabase.origin && endpoint.pathname.replace(/\/+$/, "") === expectedPath &&
      !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash;
  } catch {
    return false;
  }
}

export function getPushConfiguration() {
  const supported = typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && typeof Notification !== "undefined"
    && window.isSecureContext;

  return {
    supported,
    configured: Boolean(VAPID_PUBLIC_KEY.trim() && isTrustedPushEndpoint()),
  };
}

function pushError(status, message, extra = {}) {
  return { status, message, ...extra };
}

function decodeVapidKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const encoded = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(encoded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function getSessionForUser(userId) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data?.session;
  if (!session?.access_token || session.user?.id !== userId) {
    throw new Error("Your session has expired. Sign in again before changing push settings.");
  }
  return session;
}

async function sendSubscriptionToBackend(method, subscription, userId) {
  if (!isTrustedPushEndpoint()) throw new Error("Push subscription endpoint must be the push-subscriptions function on the configured Supabase project.");
  const session = await getSessionForUser(userId);
  const body = method === "DELETE"
    ? { endpoint: subscription?.endpoint || null }
    : { subscription: subscription?.toJSON?.() || subscription };

  const response = await fetch(PUSH_ENDPOINT, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const result = await response.json();
      detail = result?.error || result?.message || "";
    } catch {
      // A successful backend contract doesn't require a JSON response body.
    }
    throw new Error(detail || `Push service returned HTTP ${response.status}.`);
  }
}

async function getExistingRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers.");
  }

  // VitePWA owns registration and lifecycle. Never register a second worker here.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active || !registration.pushManager) {
    throw new Error("Campus Connect's existing service worker is not active yet. Reload the app and try again.");
  }
  return registration;
}

export async function getPushStatus(userId) {
  const capability = getPushConfiguration();
  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  if (!capability.supported) {
    return pushError("unsupported", "This browser or connection does not support push notifications. Use a supported browser over HTTPS.", {
      permission,
      subscriptionStatus: "unknown",
    });
  }
  if (!capability.configured) {
    return pushError("not-configured", "Push is not connected yet. The backend endpoint and VAPID key must be configured first.", {
      permission,
      subscriptionStatus: "unknown",
    });
  }

  try {
    const registration = await getExistingRegistration();
    const subscription = await registration.pushManager.getSubscription();

    // Permission and browser subscription are separate states. A user may revoke
    // permission in browser settings while the local subscription object remains;
    // expose that fact so Settings can still offer to remove it safely.
    if (permission === "denied") {
      return pushError("permission-denied", "Notifications are blocked in browser settings. A local subscription can still be removed below if one remains.", {
        permission,
        subscriptionStatus: subscription ? "present" : "absent",
      });
    }

    if (!subscription) {
      return permission === "granted"
        ? pushError("disabled", "Push notifications are off on this device.", { permission, subscriptionStatus: "absent" })
        : pushError("permission-required", "Enable push to ask your browser for permission.", { permission, subscriptionStatus: "absent" });
    }

    // A local subscription alone is not evidence that the backend has saved it.
    // PUT is an idempotent upsert in the documented backend contract.
    await sendSubscriptionToBackend("PUT", subscription, userId);
    return pushError("enabled", "Push notifications are enabled on this device.", {
      permission,
      subscriptionStatus: "registered",
    });
  } catch (error) {
    const message = error?.message || "Couldn't verify push registration with the backend.";
    const status = message.includes("service worker is not active") ? "service-worker-not-ready" : "sync-error";
    return pushError(status, message, { permission, subscriptionStatus: "unknown" });
  }
}

export async function enablePushNotifications(userId) {
  const capability = getPushConfiguration();
  if (!capability.supported) throw new Error("Push notifications are not supported by this browser or connection.");
  if (!capability.configured) throw new Error("Push is not connected yet. The backend push endpoint and public VAPID key must be configured first.");
  if (Notification.permission === "denied") throw new Error("Notifications are blocked in your browser settings. Allow them there first.");

  // Request permission only from this explicit user action.
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notification permission was denied. Change it in your browser settings to enable push."
      : "Notification permission was not granted.");
  }

  const registration = await getExistingRegistration();
  let subscription = await registration.pushManager.getSubscription();
  const createdHere = !subscription;

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(VAPID_PUBLIC_KEY.trim()),
    });
  }

  try {
    await sendSubscriptionToBackend(createdHere ? "POST" : "PUT", subscription, userId);
  } catch (error) {
    // Do not leave a new local subscription behind if the server rejected it.
    if (createdHere) {
      try { await subscription.unsubscribe(); } catch { /* Keep the original backend error. */ }
    }
    throw error;
  }

  return { status: "enabled", message: "Push notifications are enabled on this device." };
}

export async function disablePushNotifications(userId) {
  const capability = getPushConfiguration();
  if (!capability.supported) throw new Error("Push notifications are not available in this browser.");
  if (!capability.configured) throw new Error("The push backend is not configured, so this subscription cannot be safely removed from the server yet.");

  const registration = await getExistingRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { status: "disabled", message: "Push notifications are already off on this device." };

  // Remove the server registration first; only report disabled after both sides agree.
  await sendSubscriptionToBackend("DELETE", subscription, userId);
  const removed = await subscription.unsubscribe();
  if (!removed) throw new Error("The server registration was removed, but the browser could not unsubscribe. Check browser settings and try again.");
  return { status: "disabled", message: "Push notifications are off on this device." };
}

/** Best-effort server deregistration followed by local unsubscribe before explicit logout. */
export async function cleanupPushSubscriptionForLogout(userId) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  let subscription = null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
  } catch (error) {
    console.warn("Push subscription could not be inspected during logout:", error?.name || "unknown");
    return;
  }
  if (!subscription) return;

  if (userId && isTrustedPushEndpoint()) {
    try {
      await sendSubscriptionToBackend("DELETE", subscription, userId);
    } catch (error) {
      // Still unsubscribe locally. If the server delete failed, the dispatcher will
      // receive the provider's expired-endpoint response and remove the stale row.
      console.warn("Push subscription server cleanup failed during logout:", error?.name || "unknown");
    }
  }
  try {
    const removed = await subscription.unsubscribe();
    if (!removed) console.warn("Browser declined push unsubscribe during logout.");
  } catch (error) {
    console.warn("Browser push unsubscribe failed during logout:", error?.name || "unknown");
  }
}

/** Used after a sign-out observed in another tab or an expired local session. */
export async function cleanupLocalPushSubscription() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
    if (subscription) await subscription.unsubscribe();
  } catch (error) {
    console.warn("Local push cleanup after sign-out failed:", error?.name || "unknown");
  }
}
