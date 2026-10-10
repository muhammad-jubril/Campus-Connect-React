// check-signup-email — tells the signup form whether an email can still be registered.
//
// Request  (POST, JSON):  { "email": "student@gmail.com" }
// Success  (200):         { "available": true | false }      <- nothing else, ever
// Errors:                 400 { "error": "invalid_request" | "invalid_email" }
//                         405 { "error": "method_not_allowed" }
//                         429 { "error": "rate_limited", "retry_after_seconds": n }  (+ Retry-After header)
//                         500 { "error": "server_error" }
//
// Product decision: returning available:false reveals that an email is registered
// (account enumeration). That trade-off is intentional; abuse is limited by the
// server-side rate limits below. The service-role key never leaves this function.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ALLOWED_ORIGINS = (
  Deno.env.get("ALLOWED_ORIGINS") ??
  "https://campus-connect-224y.vercel.app,http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const PREVIEW_ORIGIN = /^https:\/\/campus-connect[a-z0-9-]*\.vercel\.app$/;

// Campus Wi-Fi puts many students behind one IP, so the per-IP limit is generous;
// the per-email limit is what stops probing of one address.
const IP_LIMIT = { max: 60, windowSeconds: 600 };
const EMAIL_LIMIT = { max: 8, windowSeconds: 600 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same rule as the client (src/utils/validation.js)
const MAX_BODY_CHARS = 1024;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && (ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors, ...extra },
  });
}

// Rate-limit keys are HMACs, so neither raw emails nor raw IPs are stored.
async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors, { Allow: "POST, OPTIONS" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("check-signup-email: missing runtime configuration");
    return json({ error: "server_error" }, 500, cors);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }
  if (rawBody.length > MAX_BODY_CHARS) return json({ error: "invalid_request" }, 400, cors);

  let email: unknown;
  try {
    email = JSON.parse(rawBody)?.email;
  } catch {
    return json({ error: "invalid_request" }, 400, cors);
  }
  if (typeof email !== "string") return json({ error: "invalid_email" }, 400, cors);

  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !EMAIL_RE.test(normalized)) {
    return json({ error: "invalid_email" }, 400, cors);
  }

  const ip = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const [ipHash, emailHash] = await Promise.all([
      hmacHex(serviceKey, `ip:${ip}`),
      hmacHex(serviceKey, `email:${normalized}`),
    ]);

    const limits = [
      { key: `signup-email:ip:${ipHash}`, ...IP_LIMIT },
      { key: `signup-email:email:${emailHash}`, ...EMAIL_LIMIT },
    ];
    for (const limit of limits) {
      const { data, error } = await admin.rpc("consume_rate_limit", {
        p_key: limit.key,
        p_max: limit.max,
        p_window_seconds: limit.windowSeconds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.allowed) {
        const retry = Number(row?.retry_after_seconds ?? limit.windowSeconds);
        return json({ error: "rate_limited", retry_after_seconds: retry }, 429, cors, {
          "Retry-After": String(retry),
        });
      }
    }

    const { data, error } = await admin.rpc("signup_email_available", { p_email: normalized });
    if (error || typeof data !== "boolean") throw error ?? new Error("unexpected response");
    return json({ available: data }, 200, cors);
  } catch (err) {
    // Log only an error code, never the email or IP.
    console.error("check-signup-email failed:", (err as { code?: string })?.code ?? "unknown");
    return json({ error: "server_error" }, 500, cors);
  }
});
