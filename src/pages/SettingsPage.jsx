import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { supabase } from "../services/supabase/client";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
} from "../services/pushNotifications";
import {
  loadNotificationPreferences,
  updateNotificationPreference,
} from "../services/supabase/notificationPreferences";
import "../styles/settings.css";

const CATEGORY_PREFERENCES = [
  { key: "push_likes", title: "Post likes", description: "When someone likes one of your posts." },
  { key: "push_comments", title: "Comments", description: "When someone comments on one of your posts." },
  { key: "push_replies", title: "Replies", description: "When someone replies in a comment thread." },
  { key: "push_follows", title: "New followers", description: "When someone starts following you." },
];

function permissionState() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function permissionLabel(permission) {
  if (permission === "granted") return "Allowed by browser";
  if (permission === "denied") return "Blocked in browser settings";
  if (permission === "default") return "Not requested";
  return "Not supported in this browser";
}

function deviceStateLabel(status, subscriptionStatus) {
  if (status === "permission-denied" && subscriptionStatus === "present") {
    return "Browser subscription remains; permission is blocked";
  }
  const labels = {
    checking: "Checking device…",
    enabled: "Subscription saved with backend",
    disabled: "No active subscription on this device",
    "permission-required": "Browser permission required",
    "permission-denied": "Browser permission denied",
    unsupported: "This device or connection does not support push",
    "not-configured": "Push service is not configured",
    "sync-error": "Subscription could not be verified with the backend",
    "service-worker-not-ready": "App service worker is not ready",
    error: "Device status could not be checked",
  };
  return labels[status] || "Device status unavailable";
}

function Switch({ checked, disabled, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`settings-switch${checked ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function SectionHeading({ id, eyebrow, title, description }) {
  return (
    <div className="settings-section-heading">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2 id={id}>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { currentUser, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState(null);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState("");
  const [savingPreference, setSavingPreference] = useState("");
  const savingPreferenceRef = useRef(false);
  const [pushState, setPushState] = useState({ status: "checking", message: "" });
  const [browserPermission, setBrowserPermission] = useState(permissionState);
  const [pushBusy, setPushBusy] = useState(false);
  const pushBusyRef = useRef(false);
  const [pushError, setPushError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const deletingAccountRef = useRef(false);
  const [deleteError, setDeleteError] = useState("");

  const isPushEnabled = pushState.status === "enabled" || (
    pushState.status === "permission-denied" && pushState.subscriptionStatus === "present"
  );
  const canTogglePush = pushState.status === "enabled"
    || (pushState.status === "disabled" && browserPermission !== "denied")
    || pushState.status === "permission-required"
    || (pushState.status === "permission-denied" && pushState.subscriptionStatus === "present");
  const needsPushRetry = ["sync-error", "service-worker-not-ready", "error"].includes(pushState.status);

  const loadPreferences = useCallback(async () => {
    if (!currentUser?.id) return;
    setPreferencesLoading(true);
    setPreferencesError("");
    try {
      const saved = await loadNotificationPreferences(currentUser.id);
      setPreferences(saved);
    } catch (error) {
      console.error("Notification preferences failed to load:", error);
      setPreferencesError(error?.message || "Notification preferences could not be loaded.");
    } finally {
      setPreferencesLoading(false);
    }
  }, [currentUser?.id]);

  const refreshPushState = useCallback(async () => {
    if (!currentUser?.id) return;
    setBrowserPermission(permissionState());
    setPushState({ status: "checking", message: "" });
    try {
      setPushState(await getPushStatus(currentUser.id));
    } catch (error) {
      setPushState({ status: "error", message: error?.message || "Device push status could not be checked." });
    } finally {
      setBrowserPermission(permissionState());
    }
  }, [currentUser?.id]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    void refreshPushState();
  }, [refreshPushState]);

  async function handleCategoryChange(field, value) {
    if (!currentUser?.id || savingPreferenceRef.current || preferencesLoading || !preferences) return;
    savingPreferenceRef.current = true;
    setSavingPreference(field);
    setPreferencesError("");
    try {
      const saved = await updateNotificationPreference(currentUser.id, field, value);
      setPreferences(saved);
      showToast("Notification preference saved");
    } catch (error) {
      console.error("Notification preference update failed:", error);
      showToast(error?.message || "This preference could not be saved.", "error");
    } finally {
      savingPreferenceRef.current = false;
      setSavingPreference("");
    }
  }

  async function handlePushToggle() {
    if (!currentUser?.id || pushBusyRef.current || !canTogglePush) return;
    pushBusyRef.current = true;
    setPushBusy(true);
    setPushError("");
    try {
      const next = isPushEnabled
        ? await disablePushNotifications(currentUser.id)
        : await enablePushNotifications(currentUser.id);
      setPushState(next);
      setBrowserPermission(permissionState());
      showToast(next.message || (next.status === "enabled" ? "Push enabled on this device" : "Push disabled on this device"));
    } catch (error) {
      console.error("Device push preference failed:", error);
      setPushError(error?.message || "Push settings could not be changed.");
      await refreshPushState();
    } finally {
      pushBusyRef.current = false;
      setPushBusy(false);
    }
  }

  async function handleRetryPush() {
    if (pushBusyRef.current) return;
    pushBusyRef.current = true;
    setPushBusy(true);
    setPushError("");
    try {
      await refreshPushState();
    } finally {
      pushBusyRef.current = false;
      setPushBusy(false);
    }
  }

  function openDeleteDialog() {
    setDeletePhrase("");
    setDeleteAcknowledged(false);
    setDeleteError("");
    setDeleteDialogOpen(true);
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    if (!currentUser?.id || deletingAccountRef.current || deletePhrase.trim() !== "DELETE" || !deleteAcknowledged) return;

    deletingAccountRef.current = true;
    setDeletingAccount(true);
    setDeleteError("");
    try {
      // A dedicated server-side function must perform ownership, reauthentication,
      // cleanup/retention and auth-user deletion. The browser never deletes tables.
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { confirmation: "DELETE_MY_ACCOUNT" },
      });
      if (error) {
        const status = error?.context?.status || error?.status;
        const message = error?.message || "The secure deletion service returned an error.";
        if (status === 404 || /function.*not found|could not find the function/i.test(message)) {
          throw new Error("The secure account-deletion service is not deployed yet. Completion could not be confirmed.");
        }
        throw new Error(message);
      }
      if (data?.status !== "deleted") {
        throw new Error("The server did not confirm that account deletion completed. Your session has been kept so you can retry or contact support.");
      }

      setDeleteDialogOpen(false);
      showToast("The server confirmed account deletion");
      try {
        await logout();
      } catch (logoutError) {
        console.error("Local sign-out after account deletion failed:", logoutError);
        // The server has confirmed deletion; clear the local Supabase session as a
        // fallback rather than leave a deleted account in the app UI.
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
      navigate("/", { replace: true, state: { accountDeleted: true } });
    } catch (error) {
      console.error("Account deletion was not confirmed:", error);
      setDeleteError(error?.message || "Account deletion could not be confirmed. No success has been recorded.");
    } finally {
      deletingAccountRef.current = false;
      setDeletingAccount(false);
    }
  }

  return (
    <section className="settings-page">
      <header className="settings-page-header">
        <span className="eyebrow">CAMPUS CONNECT</span>
        <h1 className="display">Settings</h1>
      </header>

      <section className="settings-card" aria-labelledby="settings-notifications-title">
        <SectionHeading
          id="settings-notifications-title"
          eyebrow="PREFERENCES"
          title="Notifications"
          description="Control push alerts on this device and choose which activity can trigger them. In-app notification history is kept."
        />

        <div className="settings-master-row">
          <div className="settings-row-copy">
            <h3>Phone push notifications</h3>
            <p>Permission and subscription are checked separately below.</p>
          </div>
          <Switch
            checked={isPushEnabled}
            disabled={pushBusy || !canTogglePush}
            label="Phone push notifications on this device"
            onChange={() => void handlePushToggle()}
          />
        </div>

        <div className="settings-push-status-grid" aria-live="polite">
          <div className="settings-status-item">
            <span>Browser permission</span>
            <strong>{permissionLabel(browserPermission)}</strong>
          </div>
          <div className="settings-status-item">
            <span>Device subscription</span>
            <strong>{deviceStateLabel(pushState.status, pushState.subscriptionStatus)}</strong>
          </div>
        </div>
        {pushState.message && <p className="settings-inline-note">{pushState.message}</p>}
        {pushError && <p className="settings-error" role="alert">{pushError}</p>}
        {(needsPushRetry || pushState.status === "not-configured" || pushState.status === "permission-denied" || pushState.status === "unsupported") && (
          <div className="settings-status-actions">
            {needsPushRetry && <button type="button" className="btn btn-ghost settings-small-button" onClick={handleRetryPush} disabled={pushBusy}>{pushBusy ? "Checking…" : "Check connection"}</button>}
            {pushState.status === "permission-denied" && <span className="settings-inline-note">Allow notifications in this browser's site settings, then check again. If a local subscription remains, switch it off here to remove it.</span>}
            {pushState.status === "unsupported" && <span className="settings-inline-note">Use a supported browser over HTTPS to enable push on this device.</span>}
            {pushState.status === "not-configured" && <span className="settings-inline-note">The public VAPID key and authenticated push endpoint must be configured first.</span>}
          </div>
        )}

        <div className="settings-divider" />
        <div className="settings-preference-heading">
          <h3>Push categories</h3>
          <span>{preferencesLoading ? "Loading…" : preferences ? "Saved to your account" : "Unavailable"}</span>
        </div>
        {preferencesLoading ? (
          <p className="settings-state" role="status">Loading notification preferences…</p>
        ) : preferencesError ? (
          <div className="settings-error-panel" role="alert">
            <p>{preferencesError}</p>
            <button type="button" className="btn btn-ghost settings-small-button" onClick={() => void loadPreferences()}>Try again</button>
          </div>
        ) : (
          <div className="settings-preference-list">
            {CATEGORY_PREFERENCES.map((item) => (
              <div className="settings-preference-row" key={item.key}>
                <div className="settings-row-copy">
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </div>
                <Switch
                  checked={Boolean(preferences?.[item.key])}
                  disabled={Boolean(savingPreference) || preferencesLoading || !preferences}
                  label={`Push notifications for ${item.title.toLowerCase()}`}
                  onChange={(nextValue) => void handleCategoryChange(item.key, nextValue)}
                />
                {savingPreference === item.key && <span className="settings-saving" role="status">Saving…</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="settings-card" aria-labelledby="settings-account-title">
        <SectionHeading id="settings-account-title" eyebrow="ACCOUNT" title="Account & privacy" description="Manage existing account and privacy controls." />
        <Link className="settings-link-row" to="/profile/edit">
          <span><strong>Edit profile</strong><small>Update your campus profile information.</small></span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link className="settings-link-row" to="/blocked-accounts">
          <span><strong>Blocked accounts</strong><small>Review and unblock accounts you've blocked.</small></span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link className="settings-link-row" to="/privacy">
          <span><strong>Privacy policy</strong><small>Review data handling and retention information.</small></span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link className="settings-link-row" to="/terms">
          <span><strong>Terms of service</strong><small>Review the terms for using Campus Connect.</small></span>
          <span aria-hidden="true">›</span>
        </Link>
      </section>

      <section className="settings-card settings-danger-card" aria-labelledby="settings-delete-title">
        <SectionHeading id="settings-delete-title" eyebrow="PERMANENT ACTION" title="Delete account" description="Account deletion cannot be undone. The secure deletion service must complete the request before the app signs you out. Limited records may be retained where required for legal, safety, or dispute-handling purposes." />
        <button type="button" className="btn btn-danger settings-delete-button" onClick={openDeleteDialog}>Delete account…</button>
      </section>

      {deleteDialogOpen && (
        <div className="modal-overlay show settings-delete-overlay" onClick={(event) => { if (event.target === event.currentTarget && !deletingAccount) setDeleteDialogOpen(false); }}>
          <section className="modal-card settings-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-delete-dialog-title" aria-describedby="settings-delete-dialog-description" onClick={(event) => event.stopPropagation()}>
            <span className="eyebrow">PERMANENT ACTION</span>
            <h2 id="settings-delete-dialog-title">Delete your account?</h2>
            <p id="settings-delete-dialog-description">This permanently deletes your account once confirmed by the secure server workflow. Your profile and access will be removed; associated content and records will be handled under the applicable retention policy. This cannot be undone.</p>
            <form onSubmit={handleDeleteAccount}>
              <label className="settings-delete-label" htmlFor="settings-delete-phrase">Type DELETE to confirm</label>
              <input
                id="settings-delete-phrase"
                className="settings-delete-input"
                value={deletePhrase}
                onChange={(event) => setDeletePhrase(event.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                disabled={deletingAccount}
                autoFocus
              />
              <label className="settings-delete-check">
                <input type="checkbox" checked={deleteAcknowledged} onChange={(event) => setDeleteAcknowledged(event.target.checked)} disabled={deletingAccount} />
                <span>I understand this action is permanent.</span>
              </label>
              {deleteError && <p className="settings-error" role="alert">{deleteError}</p>}
              <div className="settings-delete-actions">
                <button type="button" className="btn btn-ghost settings-modal-button" onClick={() => setDeleteDialogOpen(false)} disabled={deletingAccount}>Cancel</button>
                <button type="submit" className="btn btn-danger settings-modal-button" disabled={deletingAccount || deletePhrase.trim() !== "DELETE" || !deleteAcknowledged}>
                  {deletingAccount ? "Deleting account…" : "Permanently delete"}
                </button>
              </div>
              <p className="settings-delete-backend-note">If the secure deletion service is unavailable, the request will fail visibly. The app will not report success or sign you out as though deletion completed.</p>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
