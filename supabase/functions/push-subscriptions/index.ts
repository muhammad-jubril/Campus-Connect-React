// Authenticated browser registration endpoint. The user's identity always comes
// from Supabase Auth; the request body never supplies a user ID.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

// Keep known app origins in the allow-list even when ALLOWED_ORIGINS
// is set to a narrower deployment-specific list. Supabase logs observed the
// active production domain mycampusconnectt.vercel.app.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://campus-connect-224y.vercel.app",
  "https://mycampusconnectt.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const ENV_ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS])];
const PREVIEW_ORIGIN = /^https:\/\/campus-connect[a-z0-9-]*\.vercel\.app$/;
const MAX_BODY_LENGTH = 12_000;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && (ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port) return false;
    const host = endpoint.hostname.toLowerCase();
    return host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
      host.endsWith(".push.services.mozilla.com") || host === "web.push.apple.com" ||
      host === "push.apple.com" || host.endsWith(".notify.windows.com");
  } catch { return false; }
}

function validKey(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum && /^[A-Za-z0-9_-]+$/.test(value);
}

Deno.serve(async (request: Request): Promise<Response> => {
  const cors = corsHeaders(request.headers.get("origin"));
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!["POST", "PUT", "DELETE"].includes(request.method)) {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "server_configuration_error" }, 500, cors);

  const authorization = request.headers.get("authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return json({ error: "authentication_required" }, 401, cors);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
  if (authError || !authData.user) return json({ error: "invalid_session" }, 401, cors);

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_LENGTH) return json({ error: "invalid_request" }, 413, cors);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid body");
  } catch { return json({ error: "invalid_request" }, 400, cors); }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    if (request.method === "DELETE") {
      const endpoint = body.endpoint;
      if (!validEndpoint(endpoint)) return json({ error: "invalid_endpoint" }, 400, cors);
      const { error } = await admin.rpc("delete_push_subscription", {
        p_user_id: authData.user.id,
        p_endpoint: endpoint,
      });
      if (error) throw error;
      return json({ success: true }, 200, cors);
    }

    const subscription = body.subscription as Record<string, unknown> | undefined;
    const keys = subscription?.keys as Record<string, unknown> | undefined;
    const endpoint = subscription?.endpoint;
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (!validEndpoint(endpoint) || !validKey(p256dh, 20, 512) || !validKey(auth, 8, 256)) {
      return json({ error: "invalid_subscription" }, 400, cors);
    }

    const { error } = await admin.rpc("register_push_subscription", {
      p_user_id: authData.user.id,
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth_secret: auth,
    });
    if (error) {
      const message = error.message ?? "";
      if (/account unavailable|account is being deleted/i.test(message)) {
        return json({ error: "account_unavailable" }, 403, cors);
      }
      const status = message.includes("already belongs") ? 409 : message.includes("Too many") ? 429 : 400;
      return json({ error: status === 409 ? "endpoint_conflict" : status === 429 ? "subscription_limit" : "registration_failed" }, status, cors);
    }
    return json({ success: true }, 200, cors);
  } catch (error) {
    console.error("push-subscriptions failed:", (error as { code?: string })?.code ?? "unknown");
    return json({ error: "subscription_service_error" }, 500, cors);
  }
});
