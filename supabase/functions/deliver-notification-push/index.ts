import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import {
  buildPushPayload,
  type PushSubscription as WebPushSubscription,
  type VapidKeys,
} from "npm:@block65/webcrypto-web-push@2.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_SECRET = Deno.env.get("NOTIFICATION_PUSH_INTERNAL_SECRET") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "";

const supabase = createClient(
  SUPABASE_URL || "https://invalid.supabase.co",
  SERVICE_ROLE_KEY || "missing",
  { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
);

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

function requiredConfigPresent(): boolean {
  return Boolean(
    SUPABASE_URL
    && SERVICE_ROLE_KEY
    && INTERNAL_SECRET.length >= 32
    && VAPID_PUBLIC_KEY
    && VAPID_PRIVATE_KEY
    && (VAPID_SUBJECT.startsWith("mailto:") || VAPID_SUBJECT.startsWith("https://")),
  );
}

function safeBatchSize(value: unknown): number {
  const number = typeof value === "number" ? Math.floor(value) : 30;
  return Math.max(1, Math.min(Number.isFinite(number) ? number : 30, 50));
}

type Delivery = {
  delivery_id: string;
  outbox_id: string;
  subscription_id: string;
  attempt_count: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  recipient_id: string;
  notification_type: "like" | "comment" | "reply" | "follow";
  post_id: string | null;
  comment_id: string | null;
  thread_id: string | null;
  profile_id: string | null;
  actor_id: string;
  notification_created_at: string;
  target_key: string;
};

type ActorProfile = { id: string; name: string | null; username: string | null };

async function updateDelivery(row: Delivery, values: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from("notification_push_deliveries")
    .update(values)
    .eq("id", row.delivery_id);
  if (error) throw new Error("Could not update push delivery (" + error.code + ").");
}

async function isCurrentlyBlocked(recipientId: string, actorId: string): Promise<boolean> {
  if (!recipientId || !actorId || recipientId === actorId) return recipientId === actorId;
  const [blockByRecipient, blockByActor] = await Promise.all([
    supabase.from("blocked_users").select("blocker_id").eq("blocker_id", recipientId).eq("blocked_id", actorId).limit(1),
    supabase.from("blocked_users").select("blocker_id").eq("blocker_id", actorId).eq("blocked_id", recipientId).limit(1),
  ]);
  if (blockByRecipient.error || blockByActor.error) {
    throw new Error("Could not verify current block restrictions.");
  }
  return Boolean(blockByRecipient.data?.length || blockByActor.data?.length);
}

async function isPostHidden(recipientId: string, postId: string | null): Promise<boolean> {
  if (!postId) return false;
  const { data, error } = await supabase
    .from("hidden_posts")
    .select("post_id")
    .eq("user_id", recipientId)
    .eq("post_id", postId)
    .limit(1);
  if (error) throw new Error("Could not verify current hidden-content restrictions.");
  return Boolean(data?.length);
}

function notificationContent(row: Delivery, actors: Map<string, ActorProfile>) {
  const actor = actors.get(row.actor_id);
  const actorName = (actor?.name || actor?.username || "A student").trim().slice(0, 60) || "A student";
  let body: string;
  let url: string;

  switch (row.notification_type) {
    case "like":
      body = actorName + " liked your post";
      url = row.post_id ? "/post/" + encodeURIComponent(row.post_id) : "/notifications";
      break;
    case "comment":
      body = actorName + " commented on your post";
      url = row.post_id ? "/post/" + encodeURIComponent(row.post_id) + "#comments" : "/notifications";
      break;
    case "reply":
      body = actorName + " replied to your comment";
      url = row.post_id ? "/post/" + encodeURIComponent(row.post_id) + "#comments" : "/notifications";
      break;
    case "follow":
      body = actorName + " started following you";
      url = actor?.username ? "/profile/" + encodeURIComponent(actor.username) : "/notifications";
      break;
    default:
      body = "You have new activity on Campus Connect";
      url = "/notifications";
  }

  // The stable tag coalesces retries and repeated target/type alerts in the OS tray.
  const stableTag = ("cc-" + row.notification_type + "-" + row.target_key).slice(0, 200);
  return {
    title: "Campus Connect",
    body,
    tag: stableTag,
    data: { url, notificationType: row.notification_type, notificationId: row.outbox_id },
    icon: "/campus-connect-logo.png",
    badge: "/icons/icon-192.png",
  };
}

function retryDelaySeconds(attemptCount: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3600, Math.max(5, seconds));
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(3600, Math.max(5, Math.ceil((at - Date.now()) / 1000)));
  }
  return Math.min(3600, 5 * (2 ** Math.min(Math.max(attemptCount - 1, 0), 9)));
}

async function deliverOne(
  row: Delivery,
  actors: Map<string, ActorProfile>,
  vapid: VapidKeys,
): Promise<{ outboxId: string; outcome: string }> {
  try {
    if (await isCurrentlyBlocked(row.recipient_id, row.actor_id)) {
      await updateDelivery(row, {
        status: "suppressed",
        locked_at: null,
        last_error: "blocked_pair",
      });
      return { outboxId: row.outbox_id, outcome: "suppressed" };
    }
    if (await isPostHidden(row.recipient_id, row.post_id)) {
      await updateDelivery(row, {
        status: "suppressed",
        locked_at: null,
        last_error: "post_hidden_by_recipient",
      });
      return { outboxId: row.outbox_id, outcome: "suppressed" };
    }

    const subscription: WebPushSubscription = {
      endpoint: row.endpoint,
      expirationTime: null,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    const message = {
      data: notificationContent(row, actors),
      options: { ttl: 3600, urgency: "normal" as const },
    };
    const payload = await buildPushPayload(message, subscription, vapid);

    let response: Response;
    try {
      response = await fetch(row.endpoint, {
        ...payload,
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      if (row.attempt_count >= 8) {
        await updateDelivery(row, {
          status: "dead",
          locked_at: null,
          last_error: "network_error_max_attempts",
        });
        return { outboxId: row.outbox_id, outcome: "dead" };
      }
      await updateDelivery(row, {
        status: "pending",
        locked_at: null,
        next_attempt_at: new Date(Date.now() + retryDelaySeconds(row.attempt_count, null) * 1000).toISOString(),
        last_error: "network_error",
      });
      return { outboxId: row.outbox_id, outcome: "retry" };
    }

    if (response.status >= 200 && response.status < 300) {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("notification_push_deliveries")
        .update({ status: "delivered", sent_at: now, locked_at: null, last_error: null })
        .eq("id", row.delivery_id);
      if (updateError) throw new Error("Could not persist successful push status.");
      const { error: subscriptionError } = await supabase
        .from("push_subscriptions")
        .update({ last_success_at: now, last_error_at: null })
        .eq("id", row.subscription_id);
      if (subscriptionError) console.error("Push subscription success timestamp update failed.");
      return { outboxId: row.outbox_id, outcome: "delivered" };
    }

    if (response.status === 404 || response.status === 410) {
      const { error: staleError } = await supabase
        .from("notification_push_deliveries")
        .update({
          status: "expired",
          locked_at: null,
          last_error: "push_service_expired_subscription",
        })
        .eq("subscription_id", row.subscription_id)
        .in("status", ["pending", "processing"]);
      if (staleError) throw new Error("Could not retire an expired subscription.");
      const { error: deleteError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("id", row.subscription_id);
      if (deleteError) throw new Error("Could not remove an expired subscription.");
      return { outboxId: row.outbox_id, outcome: "expired" };
    }

    const transient = response.status === 408 || response.status === 425
      || response.status === 429 || response.status >= 500;
    if (transient && row.attempt_count < 8) {
      await updateDelivery(row, {
        status: "pending",
        locked_at: null,
        next_attempt_at: new Date(Date.now() + retryDelaySeconds(row.attempt_count, response.headers.get("retry-after")) * 1000).toISOString(),
        last_error: "push_http_" + response.status,
      });
      return { outboxId: row.outbox_id, outcome: "retry" };
    }

    await updateDelivery(row, {
      status: "dead",
      locked_at: null,
      last_error: "push_http_" + response.status,
    });
    await supabase
      .from("push_subscriptions")
      .update({ last_error_at: new Date().toISOString() })
      .eq("id", row.subscription_id);
    return { outboxId: row.outbox_id, outcome: "dead" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    if (row.attempt_count >= 8) {
      try {
        await updateDelivery(row, {
          status: "dead",
          locked_at: null,
          last_error: "processing_error_max_attempts",
        });
      } catch {
        console.error("Could not finalize failing push delivery.");
      }
      return { outboxId: row.outbox_id, outcome: "dead" };
    }
    try {
      await updateDelivery(row, {
        status: "pending",
        locked_at: null,
        next_attempt_at: new Date(Date.now() + retryDelaySeconds(row.attempt_count, null) * 1000).toISOString(),
        last_error: "processing_error",
      });
    } catch {
      // Stale processing locks can be reclaimed by the database after five minutes.
    }
    console.error("Push delivery attempt failed:", message.slice(0, 120));
    return { outboxId: row.outbox_id, outcome: "retry" };
  }
}

async function mapWithConcurrency<T, R>(
  rows: T[],
  limit: number,
  callback: (row: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = new Array(rows.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, rows.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= rows.length) return;
      output[index] = await callback(rows[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { error: "POST required." });
  if (!requiredConfigPresent()) {
    return json(503, { error: "Push delivery is not configured; queued notifications are retained." });
  }

  const suppliedSecret = request.headers.get("x-internal-push-secret") ?? "";
  if (!constantTimeEqual(suppliedSecret, INTERNAL_SECRET)) {
    return json(401, { error: "Unauthorized." });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is acceptable for scheduled wake-ups.
  }
  const batchSize = safeBatchSize(body.batch_size);
  const vapid: VapidKeys = {
    subject: VAPID_SUBJECT,
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
  };

  const expired = await supabase.rpc("expire_notification_push_subscriptions");
  if (expired.error) {
    console.error("Push subscription expiry sweep failed:", expired.error.code);
    return json(500, { error: "Could not reconcile expired push subscriptions." });
  }

  const prepared = await supabase.rpc("prepare_notification_push_deliveries", { p_batch_size: batchSize });
  if (prepared.error) {
    console.error("Push outbox preparation failed:", prepared.error.code);
    return json(500, { error: "Could not prepare queued push notifications." });
  }

  const claimed = await supabase.rpc("claim_notification_push_deliveries", { p_batch_size: batchSize });
  if (claimed.error) {
    console.error("Push delivery claim failed:", claimed.error.code);
    return json(500, { error: "Could not claim queued push deliveries." });
  }

  const rows = (claimed.data ?? []) as Delivery[];
  const actors = new Map<string, ActorProfile>();
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))];
  if (actorIds.length) {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id,name,username")
      .in("id", actorIds);
    if (error) {
      console.error("Push actor lookup failed:", error.code);
      return json(500, { error: "Could not resolve actors; claimed delivery locks can be reclaimed." });
    }
    for (const profile of (profiles ?? []) as ActorProfile[]) actors.set(profile.id, profile);
  }

  const results = await mapWithConcurrency(rows, 5, (row) => deliverOne(row, actors, vapid));
  const outboxIds = [...new Set(rows.map((row) => row.outbox_id))];
  const { data: activeOutboxes, error: outboxError } = await supabase
    .from("notification_push_outbox")
    .select("id")
    .eq("status", "processing")
    .limit(500);
  if (outboxError) console.error("Push outbox refresh query failed:", outboxError.code);

  for (const id of new Set([...outboxIds, ...(activeOutboxes ?? []).map((row) => row.id)])) {
    const { error } = await supabase.rpc("finalize_notification_push_outbox", { p_outbox_id: id });
    if (error) console.error("Push outbox finalization failed:", error.code);
  }

  const summary = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
    return counts;
  }, {});
  return json(200, { prepared: prepared.data ?? 0, claimed: rows.length, results: summary });
});
