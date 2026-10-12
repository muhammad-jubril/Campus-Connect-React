// Scheduled worker. Deploy with VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT and PUSH_DISPATCH_SECRET set as Supabase function secrets.
// Configure the scheduled caller described in diagnostics/push-dispatch-setup.md.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import webpush from "npm:web-push@3.6.7";

type QueueRow = {
  queue_id: string;
  recipient_id: string;
  group_key: string;
  latest_notification_id: string | null;
  activity_count: number;
  attempt_count: number;
};
type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  comment_id: string | null;
  read: boolean;
};
type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth_secret: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const count = Math.max(a.length, b.length);
  for (let i = 0; i < count; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function targetUrl(notification: NotificationRow, username?: string | null): string {
  if (notification.type === "follow") {
    return username ? `/profile/${encodeURIComponent(username)}` : "/notifications";
  }
  if (notification.post_id) {
    return `/post/${encodeURIComponent(notification.post_id)}${notification.type === "comment" || notification.type === "reply" ? "#comments" : ""}`;
  }
  return "/notifications";
}

function pushBody(type: string, count: number, actorName: string): string {
  if (count > 1) {
    if (type === "like") return `Your post received ${count} new likes.`;
    if (type === "comment") return `There are ${count} new comments on your post.`;
    if (type === "reply") return `There are ${count} new replies to your comment.`;
    if (type === "follow") return `You have ${count} new followers.`;
    return `You have ${count} new activities on Campus Connect.`;
  }
  if (type === "like") return `${actorName} liked your post.`;
  if (type === "comment") return `${actorName} commented on your post.`;
  if (type === "reply") return `${actorName} replied to your comment.`;
  if (type === "follow") return `${actorName} started following you.`;
  return `${actorName} interacted with your content.`;
}

function statusCode(error: unknown): number | null {
  const candidate = error as { statusCode?: unknown; status?: unknown };
  const code = Number(candidate?.statusCode ?? candidate?.status);
  return Number.isFinite(code) && code > 0 ? code : null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET") ?? "";
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
  if (!url || !serviceKey || dispatchSecret.length < 32 || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error("push dispatcher has missing runtime configuration");
    return json({ error: "server_configuration_error" }, 500);
  }
  if (!constantTimeEqual(request.headers.get("x-push-dispatch-secret") ?? "", dispatchSecret)) {
    return json({ error: "unauthorized" }, 401);
  }

  let batchLimit = 50;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return json({ error: "invalid_request" }, 400);
    if (raw.trim()) {
      const body = JSON.parse(raw);
      if (body?.limit !== undefined) batchLimit = Number(body.limit);
    }
  } catch { return json({ error: "invalid_request" }, 400); }
  if (!Number.isFinite(batchLimit)) return json({ error: "invalid_limit" }, 400);
  batchLimit = Math.min(Math.max(Math.trunc(batchLimit), 1), 100);

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: batches, error: claimError } = await admin.rpc("claim_push_notification_batches", { p_limit: batchLimit });
  if (claimError) {
    console.error("push queue claim failed:", claimError.code ?? "unknown");
    return json({ error: "queue_unavailable" }, 500);
  }

  let sent = 0;
  let retried = 0;
  let failed = 0;
  for (const batch of (batches ?? []) as QueueRow[]) {
    try {
      if (!batch.latest_notification_id) {
        await admin.rpc("finish_push_notification_batch", { p_queue_id: batch.queue_id, p_outcome: "sent", p_error_code: null });
        continue;
      }
      const { data: notification, error: notificationError } = await admin.from("notifications")
        .select("id,recipient_id,actor_id,type,post_id,comment_id,read")
        .eq("id", batch.latest_notification_id).eq("recipient_id", batch.recipient_id).maybeSingle();
      if (notificationError) throw notificationError;
      if (!notification || notification.read || !notification.actor_id || notification.actor_id === notification.recipient_id) {
        await admin.rpc("finish_push_notification_batch", { p_queue_id: batch.queue_id, p_outcome: "sent", p_error_code: null });
        sent++;
        continue;
      }

      const { data: blocked, error: blockError } = await admin.rpc("is_notification_pair_blocked", {
        p_first_user: notification.recipient_id,
        p_second_user: notification.actor_id,
      });
      if (blockError) throw blockError;
      if (blocked === true) {
        await admin.rpc("finish_push_notification_batch", { p_queue_id: batch.queue_id, p_outcome: "sent", p_error_code: null });
        sent++;
        continue;
      }

      // Re-check recipient-specific content hiding at send time. Reporting alone
      // does not hide content; only an explicit hidden_posts preference suppresses
      // that target's push, while the underlying notification remains persisted.
      if (notification.post_id) {
        const { data: hiddenTarget, error: hiddenError } = await admin
          .from("hidden_posts")
          .select("post_id")
          .eq("user_id", notification.recipient_id)
          .eq("post_id", notification.post_id)
          .maybeSingle();
        if (hiddenError) throw hiddenError;
        if (hiddenTarget) {
          await admin.rpc("finish_push_notification_batch", {
            p_queue_id: batch.queue_id,
            p_outcome: "sent",
            p_error_code: "target_hidden_by_recipient",
          });
          sent++;
          continue;
        }
      }

      const { data: subscriptions, error: subscriptionsError } = await admin.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth_secret").eq("user_id", batch.recipient_id);
      if (subscriptionsError) throw subscriptionsError;
      if (!(subscriptions ?? []).length) {
        await admin.rpc("finish_push_notification_batch", { p_queue_id: batch.queue_id, p_outcome: "sent", p_error_code: null });
        sent++;
        continue;
      }

      const { data: actor } = await admin.from("profiles").select("username,name").eq("id", notification.actor_id).maybeSingle();
      const actorName = actor?.name || (actor?.username ? `@${actor.username}` : "A student");
      const payload = JSON.stringify({
        title: "Campus Connect",
        body: pushBody(notification.type, Number(batch.activity_count) || 1, actorName),
        icon: "/campus-connect-logo.png",
        badge: "/icons/icon-192.png",
        tag: `campus-connect:${batch.recipient_id}:${batch.group_key}`.slice(0, 180),
        data: { url: targetUrl(notification as NotificationRow, actor?.username) },
      });

      let hasRetryableFailure = false;
      let hasPermanentFailure = false;
      for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
        const { data: receipt, error: receiptError } = await admin.from("push_delivery_receipts")
          .select("state,attempts").eq("queue_id", batch.queue_id).eq("subscription_id", subscription.id).maybeSingle();
        if (receiptError) throw receiptError;
        if (["delivered", "expired", "permanent_failure"].includes(receipt?.state)) continue;

        const attempt = Number(receipt?.attempts ?? 0) + 1;
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } }, payload, {
            TTL: 300,
            urgency: "normal",
          });
          const { error } = await admin.from("push_delivery_receipts").upsert({
            queue_id: batch.queue_id, subscription_id: subscription.id, state: "delivered", attempts: attempt,
            delivered_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
          }, { onConflict: "queue_id,subscription_id" });
          if (error) throw error;
        } catch (error) {
          const status = statusCode(error);
          if (status === 404 || status === 410) {
            const { error: receiptUpsertError } = await admin.from("push_delivery_receipts").upsert({
              queue_id: batch.queue_id, subscription_id: subscription.id, state: "expired", attempts: attempt,
              last_error: `http_${status}`, updated_at: new Date().toISOString(),
            }, { onConflict: "queue_id,subscription_id" });
            if (receiptUpsertError) throw receiptUpsertError;
            const { error: deleteError } = await admin.from("push_subscriptions").delete().eq("id", subscription.id);
            if (deleteError) throw deleteError;
            continue;
          }
          const retryable = status === null || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
          const { error: receiptUpsertError } = await admin.from("push_delivery_receipts").upsert({
            queue_id: batch.queue_id, subscription_id: subscription.id,
            state: retryable ? "retryable_failure" : "permanent_failure", attempts: attempt,
            last_error: status ? `http_${status}` : "push_provider_error", updated_at: new Date().toISOString(),
          }, { onConflict: "queue_id,subscription_id" });
          if (receiptUpsertError) throw receiptUpsertError;
          if (retryable) hasRetryableFailure = true;
          else hasPermanentFailure = true;
        }
      }

      const outcome = hasRetryableFailure ? "retry" : hasPermanentFailure ? "failed" : "sent";
      const { error: finishError } = await admin.rpc("finish_push_notification_batch", {
        p_queue_id: batch.queue_id,
        p_outcome: outcome,
        p_error_code: outcome === "sent" ? null : outcome === "retry" ? "temporary_push_provider_error" : "permanent_push_provider_error",
      });
      if (finishError) throw finishError;
      if (outcome === "sent") sent++;
      else if (outcome === "retry") retried++;
      else failed++;
    } catch (error) {
      const code = (error as { code?: string; statusCode?: number })?.code ??
        ((error as { statusCode?: number })?.statusCode ? `http_${(error as { statusCode: number }).statusCode}` : "worker_error");
      console.error("push batch failed:", code);
      try {
        await admin.rpc("finish_push_notification_batch", {
          p_queue_id: batch.queue_id,
          p_outcome: "retry",
          p_error_code: String(code).slice(0, 180),
        });
      } catch (finishError) {
        console.error("push batch could not be rescheduled:", (finishError as { code?: string })?.code ?? "unknown");
      }
      retried++;
    }
  }
  return json({ claimed: (batches ?? []).length, sent, retried, failed });
});
