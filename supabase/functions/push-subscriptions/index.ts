import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("PUSH_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const json = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });

function originAllowed(origin: string | null): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin.replace(/\/+$/, ""));
}

function corsHeaders(origin: string | null): Record<string, string> {
  const normalized = origin?.replace(/\/+$/, "");
  return {
    "Access-Control-Allow-Origin": normalized && ALLOWED_ORIGINS.includes(normalized) ? normalized : "*",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

function validPushHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "fcm.googleapis.com"
    || host === "android.googleapis.com"
    || host === "updates.push.services.mozilla.com"
    || host === "push.services.mozilla.com"
    || host.endsWith(".push.services.mozilla.com")
    || host === "web.push.apple.com"
    || host.endsWith(".push.apple.com")
    || host.endsWith(".notify.windows.com");
}

function validateEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 20 || value.length > 4096) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || (parsed.port && parsed.port !== "443")
      || !validPushHost(parsed.hostname)
    ) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function isB64Url(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length >= 8
    && value.length <= maxLength
    && /^[A-Za-z0-9_-]+$/.test(value);
}

async function authenticatedUser(request: Request): Promise<string | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || !SERVICE_ROLE_KEY || !SUPABASE_URL) return null;

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    if (!originAllowed(origin)) return new Response("Origin not allowed", { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (!originAllowed(origin)) return json(403, { error: "Origin not allowed." }, null);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(503, { error: "Push subscription storage is not configured." }, origin);
  }

  if (!["POST", "PUT", "DELETE"].includes(request.method)) {
    return json(405, { error: "Method not allowed." }, origin);
  }

  const userId = await authenticatedUser(request);
  if (!userId) return json(401, { error: "A valid signed-in session is required." }, origin);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Expected a JSON request body." }, origin);
  }

  if (request.method === "DELETE") {
    const endpoint = validateEndpoint(body.endpoint);
    if (!endpoint) return json(400, { error: "A valid browser push endpoint is required." }, origin);

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);

    if (error) {
      console.error("Push subscription removal failed:", error.code);
      return json(500, { error: "The push subscription could not be removed." }, origin);
    }
    return json(200, { status: "removed" }, origin);
  }

  const raw = body.subscription as Record<string, unknown> | undefined;
  const endpoint = validateEndpoint(raw?.endpoint);
  const keys = raw?.keys as Record<string, unknown> | undefined;
  if (!endpoint || !isB64Url(keys?.p256dh, 256) || !isB64Url(keys?.auth, 128)) {
    return json(400, { error: "The browser push subscription is invalid or unsupported." }, origin);
  }

  let expirationTime: string | null = null;
  const rawExpiration = raw?.expirationTime;
  if (rawExpiration !== null && rawExpiration !== undefined) {
    if (typeof rawExpiration !== "number" || !Number.isFinite(rawExpiration) || rawExpiration <= Date.now()) {
      return json(400, { error: "The browser push subscription has expired." }, origin);
    }
    expirationTime = new Date(rawExpiration).toISOString();
  }

  const subscriptionRow = {
    user_id: userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    expiration_time: expirationTime,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: lookupError } = await supabase
    .from("push_subscriptions")
    .select("id,user_id")
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (lookupError) {
    console.error("Push subscription lookup failed:", lookupError.code);
    return json(500, { error: "The push subscription could not be synchronized." }, origin);
  }
  if (existing && existing.user_id !== userId) {
    return json(409, { error: "This browser subscription is already linked to another account." }, origin);
  }

  if (existing) {
    const { error } = await supabase
      .from("push_subscriptions")
      .update({
        p256dh: subscriptionRow.p256dh,
        auth: subscriptionRow.auth,
        expiration_time: subscriptionRow.expiration_time,
        updated_at: subscriptionRow.updated_at,
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) {
      console.error("Push subscription update failed:", error.code);
      return json(500, { error: "The push subscription could not be synchronized." }, origin);
    }
  } else {
    const { error } = await supabase.from("push_subscriptions").insert(subscriptionRow);
    if (error?.code === "23505") {
      // Another request may have registered the same endpoint concurrently.
      // Re-read ownership but never transfer an endpoint between accounts.
      const { data: raced } = await supabase
        .from("push_subscriptions")
        .select("id,user_id")
        .eq("endpoint", endpoint)
        .maybeSingle();
      if (!raced || raced.user_id !== userId) {
        return json(409, { error: "This browser subscription is already linked to another account." }, origin);
      }
      const { error: retryError } = await supabase
        .from("push_subscriptions")
        .update({
          p256dh: subscriptionRow.p256dh,
          auth: subscriptionRow.auth,
          expiration_time: subscriptionRow.expiration_time,
          updated_at: subscriptionRow.updated_at,
        })
        .eq("id", raced.id)
        .eq("user_id", userId);
      if (retryError) return json(500, { error: "The push subscription could not be synchronized." }, origin);
    } else if (error) {
      console.error("Push subscription insert failed:", error.code);
      return json(500, { error: "The push subscription could not be saved." }, origin);
    }
  }

  return json(200, { status: "saved" }, origin);
});
