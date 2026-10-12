// Secure account deletion for Campus Connect Settings.
//
// User request: POST { confirmation: "DELETE_MY_ACCOUNT" } with the current
// access token. The account ID comes exclusively from auth.getUser(token).
// Recovery: the scheduled caller sends { mode: "retry" } plus a Vault-backed
// worker secret; no service-role credential is returned to a caller.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ALLOWED_ORIGINS = [
  "https://mycampusconnectt.vercel.app",
  "https://campus-connect-224y.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const PREVIEW_ORIGIN = /^https:\/\/campus-connect[a-z0-9-]*\.vercel\.app$/;
const REPORT_RETENTION_DAYS = 180;
const RECENT_AUTH_SECONDS = 10 * 60;
const MEDIA_BUCKETS = ["avatars", "post-media", "marketplace-images"] as const;
type MediaBucket = typeof MEDIA_BUCKETS[number];
type JobStatus = "database_cleanup" | "storage_cleanup" | "auth_delete_pending" | "complete" | "disabled_anonymized";
type DeletionJob = {
  job_id: string;
  user_id: string;
  status: JobStatus;
  attempt_count: number;
  recovery_deadline: string;
};
type ListedObject = { name: string; id?: string | null; metadata?: Record<string, unknown> | null };

function json(body: unknown, status = 200, origin: string | null = null): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-account-deletion-worker-secret",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && (ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return data && typeof data === "object" ? data as T : null;
}

function safeErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  const code = String(candidate?.code ?? "");
  const status = Number(candidate?.status ?? candidate?.statusCode ?? 0);
  if (status === 401 || code === "401") return "auth_delete_failed";
  if (status === 403 || code === "403") return "permission_denied";
  if (status === 404 || code === "404") return "not_found";
  if (/storage/i.test(code)) return "storage_cleanup_failed";
  return "service_error";
}

function isAuthNotFound(error: unknown): boolean {
  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  return Number(candidate?.status ?? candidate?.statusCode) === 404
    || candidate?.code === "user_not_found"
    || /user not found/i.test(String(candidate?.message ?? ""));
}

async function requestGlobalSignOut(projectUrl: string, anonKey: string, accessToken: string): Promise<void> {
  // Revokes refresh sessions globally. A previously issued access JWT is stateless,
  // so restrictive active-profile RLS policies also block account data immediately.
  try {
    await fetch(new URL("/auth/v1/logout?scope=global", projectUrl), {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Deletion remains incomplete until the Auth Admin deletion is confirmed.
  }
}

async function listFolderObjects(
  admin: ReturnType<typeof createClient>,
  bucket: MediaBucket,
  folder: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 5 || folder.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("storage_list_failed");
  }
  const paths: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(folder, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error("storage_list_failed");
    const items = (data ?? []) as ListedObject[];
    for (const item of items) {
      if (!item.name || item.name === "." || item.name === ".." || item.name.includes("/")) {
        throw new Error("storage_list_invalid_path");
      }
      const childPath = `${folder}/${item.name}`;
      const isFolder = !item.id && !item.metadata;
      if (isFolder) paths.push(...await listFolderObjects(admin, bucket, childPath, depth + 1));
      else paths.push(childPath);
    }
    if (items.length < 100) break;
    offset += items.length;
  }
  return paths;
}

function publicObjectUrl(projectUrl: string, bucket: string, objectPath: string): string {
  const encodedPath = objectPath.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${projectUrl.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

async function enqueueSharedObject(
  admin: ReturnType<typeof createClient>,
  jobId: string,
  bucket: MediaBucket,
  objectPath: string,
  publicUrl: string,
): Promise<void> {
  const { error } = await admin.rpc("enqueue_account_deletion_media", {
    p_job_id: jobId,
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_public_url: publicUrl,
  });
  if (error) throw new Error("media_retention_queue_failed");
}

async function cleanOwnedStorage(
  admin: ReturnType<typeof createClient>,
  projectUrl: string,
  jobId: string,
  userId: string,
): Promise<void> {
  for (const bucket of MEDIA_BUCKETS) {
    const objectPaths = await listFolderObjects(admin, bucket, userId);
    for (const objectPath of objectPaths) {
      // The only path accepted for direct cleanup is inside the authenticated
      // owner's UUID folder. Do not trust paths from the request body.
      if (!objectPath.startsWith(`${userId}/`) || objectPath.includes("/../")) {
        throw new Error("storage_list_invalid_path");
      }
      const publicUrl = publicObjectUrl(projectUrl, bucket, objectPath);
      const { data: referenced, error: referenceError } = await admin.rpc(
        "account_deletion_media_is_referenced",
        { p_bucket_id: bucket, p_object_path: objectPath, p_public_url: publicUrl },
      );
      if (referenceError) throw new Error("storage_reference_check_failed");
      if (referenced === true) {
        // Shared media stays only while a surviving profile, post, listing, or
        // report still references it. The scheduled worker rechecks it and
        // removes it when safe, up to the same finite 180-day retention cap.
        await enqueueSharedObject(admin, jobId, bucket, objectPath, publicUrl);
        continue;
      }
      const { error: removeError } = await admin.storage.from(bucket).remove([objectPath]);
      if (removeError) throw new Error("storage_remove_failed");
    }
  }
}

async function processDeferredMedia(admin: ReturnType<typeof createClient>): Promise<{ removed: number; retained: number; retried: number }> {
  const { data, error } = await admin.rpc("claim_account_deletion_media", { p_limit: 50 });
  if (error) throw new Error("media_recovery_claim_failed");
  let removed = 0;
  let retained = 0;
  let retried = 0;
  for (const item of (data ?? []) as Array<{
    media_id: string; bucket_id: MediaBucket; object_path: string; public_url: string; expires_at: string;
  }>) {
    try {
      const { data: referenced, error: referenceError } = await admin.rpc(
        "account_deletion_media_is_referenced",
        { p_bucket_id: item.bucket_id, p_object_path: item.object_path, p_public_url: item.public_url },
      );
      if (referenceError) throw new Error("storage_reference_check_failed");
      if (referenced === true) {
        await admin.rpc("set_account_deletion_media_state", {
          p_media_id: item.media_id,
          p_state: "shared_retained",
          p_error_code: null,
        });
        retained++;
        continue;
      }
      const { error: removeError } = await admin.storage.from(item.bucket_id).remove([item.object_path]);
      if (removeError) throw new Error("storage_remove_failed");
      const { error: markError } = await admin.rpc("set_account_deletion_media_state", {
        p_media_id: item.media_id,
        p_state: "deleted",
        p_error_code: null,
      });
      if (markError) throw new Error("media_state_update_failed");
      removed++;
    } catch {
      await admin.rpc("set_account_deletion_media_state", {
        p_media_id: item.media_id,
        p_state: "pending",
        p_error_code: "storage_remove_failed",
      });
      retried++;
    }
  }
  return { removed, retained, retried };
}

async function noteFailure(admin: ReturnType<typeof createClient>, jobId: string, code: string): Promise<void> {
  await admin.rpc("record_account_deletion_error", {
    p_job_id: jobId,
    p_error_code: code,
  });
}

async function processJob(
  admin: ReturnType<typeof createClient>,
  projectUrl: string,
  anonKey: string,
  job: DeletionJob,
  accessToken: string | null,
): Promise<"deleted" | "disabled" | "pending"> {
  let phase = job.status;
  try {
    if (phase === "database_cleanup") {
      const { data, error } = await admin.rpc("apply_account_deletion_database_cleanup", {
        p_job_id: job.job_id,
      });
      if (error) throw new Error("database_cleanup_failed");
      const row = firstRow<{ next_status: string }>(data);
      phase = row?.next_status === "storage_cleanup" ? "storage_cleanup" : phase;
    }

    if (phase === "storage_cleanup") {
      await cleanOwnedStorage(admin, projectUrl, job.job_id, job.user_id);
      const { error } = await admin.rpc("mark_account_deletion_auth_pending", { p_job_id: job.job_id });
      if (error) throw new Error("storage_cleanup_failed");
      phase = "auth_delete_pending";
    }

    if (phase === "auth_delete_pending") {
      const { error: deleteError } = await admin.auth.admin.deleteUser(job.user_id);
      let authDeletionConfirmed = !deleteError;

      if (deleteError && isAuthNotFound(deleteError)) {
        // A retry can observe a deletion performed before a previous job-state
        // write failed. Confirm that the Auth record is absent before reporting
        // the hard-deletion status.
        const { data: lookupData, error: lookupError } = await admin.auth.admin.getUserById(job.user_id);
        authDeletionConfirmed = Boolean(
          (lookupError && isAuthNotFound(lookupError)) ||
          (!lookupError && !lookupData?.user),
        );
        if (!authDeletionConfirmed) throw new Error("auth_delete_failed");
      } else if (deleteError) {
        if (Date.parse(job.recovery_deadline) <= Date.now()) {
          // After 30 days of failed hard-delete attempts, ask Auth for its
          // irreversible soft-delete fallback. Supabase retains only a hashed
          // identifier for recovery/audit, not the live user identity. This is
          // intentionally returned as "disabled", never as full deletion.
          const { error: softDeleteError } = await admin.auth.admin.deleteUser(job.user_id, true);
          if (softDeleteError) throw new Error("auth_disable_failed");
          if (accessToken) await requestGlobalSignOut(projectUrl, anonKey, accessToken);
          const { error: markedError } = await admin.rpc("mark_account_deletion_disabled", {
            p_job_id: job.job_id,
          });
          if (markedError) throw new Error("auth_disable_failed");
          return "disabled";
        }
        if (accessToken) await requestGlobalSignOut(projectUrl, anonKey, accessToken);
        const { error: banError } = await admin.auth.admin.updateUserById(job.user_id, {
          ban_duration: "876000h",
        });
        if (banError) throw new Error("auth_disable_failed");
        throw new Error("auth_delete_failed");
      }

      if (!authDeletionConfirmed) throw new Error("auth_delete_failed");
      const { error: completeError } = await admin.rpc("complete_account_deletion", {
        p_job_id: job.job_id,
      });
      if (completeError) throw new Error("auth_delete_failed");
      return "deleted";
    }
    return "pending";
  } catch (error) {
    const code = error instanceof Error
      ? (["database_cleanup_failed","storage_cleanup_failed","auth_delete_failed","auth_disable_failed"].includes(error.message)
        ? error.message
        : phase === "database_cleanup" ? "database_cleanup_failed"
        : phase === "storage_cleanup" ? "storage_cleanup_failed"
        : "retry_worker_failed")
      : "retry_worker_failed";
    await noteFailure(admin, job.job_id, code);
    return "pending";
  }
}

async function runRecoveryWorker(
  admin: ReturnType<typeof createClient>,
  projectUrl: string,
  anonKey: string,
): Promise<Response> {
  const { data, error } = await admin.rpc("claim_account_deletion_jobs", { p_limit: 10 });
  if (error) return json({ error: "recovery_unavailable" }, 500);
  let deleted = 0;
  let disabled = 0;
  let pending = 0;
  for (const job of (data ?? []) as DeletionJob[]) {
    const outcome = await processJob(admin, projectUrl, anonKey, job, null);
    if (outcome === "deleted") deleted++;
    else if (outcome === "disabled") disabled++;
    else pending++;
  }
  let media: { removed: number; retained: number; retried: number };
  try {
    media = await processDeferredMedia(admin);
  } catch {
    media = { removed: 0, retained: 0, retried: 1 };
  }
  return json({
    claimed: (data ?? []).length,
    deleted,
    disabled_auth_pending: disabled,
    retrying: pending,
    deferred_media_removed: media.removed,
    shared_media_waiting: media.retained,
    deferred_media_retried: media.retried,
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json({}, 204, origin).headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !anonKey || !serviceKey) return json({ error: "server_configuration_error" }, 500, origin);

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "invalid_request" }, 413, origin);
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_request" }, 400, origin);
  }

  const admin = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const workerSecret = request.headers.get("x-account-deletion-worker-secret") ?? "";
  if (body.mode === "retry" || workerSecret) {
    if (workerSecret.length < 32) return json({ error: "unauthorized" }, 401, origin);
    const { data: authorized, error } = await admin.rpc("authorize_account_deletion_worker", {
      p_supplied_secret: workerSecret,
    });
    if (error || authorized !== true) return json({ error: "unauthorized" }, 401, origin);
    return await runRecoveryWorker(admin, projectUrl, anonKey);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return json({ error: "authentication_required" }, 401, origin);

  const authClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenMatch[1]}` } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
  if (authError || !authData.user) return json({ error: "invalid_session" }, 401, origin);

  if (body.confirmation !== "DELETE_MY_ACCOUNT") {
    return json({ error: "explicit_confirmation_required" }, 400, origin);
  }
  const lastSignIn = Date.parse(authData.user.last_sign_in_at ?? "");
  if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > RECENT_AUTH_SECONDS * 1000 || lastSignIn > Date.now() + 60_000) {
    return json({
      error: "reauthentication_required",
      message: "Please sign in again within the last 10 minutes before deleting your account.",
    }, 428, origin);
  }

  const { data: jobData, error: beginError } = await admin.rpc("begin_account_deletion", {
    p_user_id: authData.user.id,
  });
  if (beginError) {
    console.error("account deletion begin failed:", beginError.code ?? "unknown");
    return json({ error: "deletion_request_failed" }, 500, origin);
  }
  const job = firstRow<DeletionJob & { acquired: boolean }>(jobData);
  if (!job) return json({ error: "deletion_request_failed" }, 500, origin);
  if (!job.acquired) {
    return json({
      status: "pending",
      phase: job.status,
      message: "Deletion is already being processed. The server will continue recovery safely.",
    }, 202, origin);
  }

  const outcome = await processJob(admin, projectUrl, anonKey, job, tokenMatch[1]);
  if (outcome === "deleted") return json({ status: "deleted" }, 200, origin);
  if (outcome === "disabled") {
    return json({
      status: "disabled",
      message: "Account data was removed and sign-in was disabled, but the authentication record could not be hard-deleted. This is not reported as full deletion.",
    }, 202, origin);
  }
  return json({
    status: "pending",
    phase: job.status,
    message: "Deletion is not yet complete. The backend recorded the incomplete phase and will retry; no success has been reported.",
  }, 503, origin);
});
