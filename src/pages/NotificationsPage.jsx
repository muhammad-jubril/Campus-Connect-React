import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import NotificationList from "../components/notifications/NotificationList";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { useToast } from "../hooks/useToast";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
} from "../services/pushNotifications";
import {
  groupNotifications,
  notificationDestination,
} from "../utils/notificationGrouping";
import "../styles/notifications.css";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function PushIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M10 18h4" />
      <path d="M9 6h6" />
    </svg>
  );
}

function pushLabel(status) {
  if (status === "enabled") return "Push notifications are enabled on this device.";
  if (status === "disabled") return "Push notifications are off on this device.";
  if (status === "permission-required") return "Enable push to ask your browser for permission.";
  if (status === "permission-denied") return "Notifications are blocked in browser settings.";
  if (status === "unsupported") return "This browser or connection does not support push notifications.";
  if (status === "not-configured") return "Push setup is not connected yet. The backend endpoint and VAPID key are required.";
  if (status === "sync-error") return "A browser subscription exists, but the server could not confirm it.";
  if (status === "service-worker-not-ready") return "The existing app service worker is not active yet. Reload and try again.";
  if (status === "error") return "Push settings could not be checked.";
  return "Checking this device…";
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const {
    notifications,
    unreadCount,
    listLoading,
    listError,
    realtimeStatus,
    refreshNotifications,
    markRead,
    markGroupRead,
    markAllRead,
  } = useNotifications();

  const [pushState, setPushState] = useState({ status: "checking", message: "" });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  useEffect(() => {
    refreshNotifications({ includeList: true });
  }, [refreshNotifications]);

  useEffect(() => {
    let active = true;
    setPushState({ status: "checking", message: "" });
    if (!currentUser?.id) return () => { active = false; };

    getPushStatus(currentUser.id)
      .then((state) => { if (active) setPushState(state); })
      .catch((error) => {
        if (active) setPushState({ status: "error", message: error?.message || "" });
      });
    return () => { active = false; };
  }, [currentUser?.id]);

  async function handleOpenNotification(notification) {
    const destination = notificationDestination(notification);
    try {
      if (!notification.read) await markRead(notification.id);
    } catch (error) {
      showToast(error?.message || "Couldn't mark the notification as read.", "error");
    }
    if (destination) navigate(destination);
  }

  async function handleOpenGroup(group) {
    const destination = notificationDestination(group.items[0]);
    try {
      await markGroupRead(group.items.map((item) => item.id));
    } catch (error) {
      showToast(error?.message || "Couldn't mark this activity as read.", "error");
    }
    if (destination) navigate(destination);
  }

  async function handleMarkItemRead(notification) {
    try {
      await markRead(notification.id);
    } catch (error) {
      showToast(error?.message || "Couldn't mark this notification as read.", "error");
    }
  }

  async function handleMarkGroupRead(group) {
    try {
      await markGroupRead(group.items.map((item) => item.id));
    } catch (error) {
      showToast(error?.message || "Couldn't mark this activity as read.", "error");
    }
  }

  async function handleMarkAllRead() {
    if (!unreadCount || markAllBusy) return;
    setMarkAllBusy(true);
    try {
      await markAllRead();
      showToast("All notifications marked as read");
    } catch (error) {
      showToast(error?.message || "Couldn't mark notifications as read.", "error");
    } finally {
      setMarkAllBusy(false);
    }
  }

  async function handleRefreshPush() {
    if (pushBusy || !currentUser?.id) return;
    setPushBusy(true);
    setPushError("");
    try {
      const state = pushState.status === "enabled"
        ? await disablePushNotifications(currentUser.id)
        : await enablePushNotifications(currentUser.id);
      setPushState(state);
      showToast(state.message || (state.status === "enabled" ? "Push enabled" : "Push disabled"));
    } catch (error) {
      setPushError(error?.message || "Couldn't update push settings.");
      setPushState((previous) => ({
        ...previous,
        message: error?.message || previous.message,
        status: previous.status === "enabled" ? "sync-error" : previous.status,
      }));
    } finally {
      setPushBusy(false);
    }
  }

  async function retryPushStatus() {
    if (!currentUser?.id) return;
    setPushBusy(true);
    setPushError("");
    try {
      setPushState(await getPushStatus(currentUser.id));
    } catch (error) {
      setPushState({ status: "error", message: error?.message || "" });
    } finally {
      setPushBusy(false);
    }
  }

  const pushCanChange = ["enabled", "disabled", "permission-required", "sync-error", "error"].includes(pushState.status);
  const pushIsEnabled = pushState.status === "enabled";

  return (
    <main className="notifications-page">
      <header className="notifications-header">
        <div className="notifications-title-icon"><BellIcon /></div>
        <div className="notifications-title-copy">
          <span className="eyebrow">CAMPUS CONNECT</span>
          <h1 className="display">Notifications</h1>
          <p>Keep up with activity on your posts and campus profile.</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost notifications-refresh"
          onClick={() => refreshNotifications({ includeList: true })}
          disabled={listLoading}
        >
          {listLoading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="notifications-push-card" aria-labelledby="notifications-push-title">
        <div className="notifications-push-icon"><PushIcon /></div>
        <div className="notifications-push-copy">
          <h2 id="notifications-push-title">Phone push notifications</h2>
          <p>{pushState.message || pushLabel(pushState.status)}</p>
          {pushError && <p className="notifications-error-text" role="alert">{pushError}</p>}
        </div>
        {pushCanChange ? (
          <button
            type="button"
            className={`btn ${pushIsEnabled ? "btn-ghost" : "btn-primary"} notifications-push-button`}
            onClick={handleRefreshPush}
            disabled={pushBusy}
          >
            {pushBusy ? "Working…" : pushIsEnabled ? "Disable push" : pushState.status === "sync-error" || pushState.status === "error" ? "Retry connection" : "Enable push"}
          </button>
        ) : pushState.status === "service-worker-not-ready" ? (
          <button type="button" className="btn btn-ghost notifications-push-button" onClick={retryPushStatus} disabled={pushBusy}>
            {pushBusy ? "Checking…" : "Check again"}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost notifications-push-button" disabled>
            {pushState.status === "checking" ? "Checking…" : pushState.status === "unsupported" ? "Unavailable" : pushState.status === "permission-denied" ? "Blocked" : "Not configured"}
          </button>
        )}
      </section>

      <div className="notifications-list-heading">
        <div>
          <h2>Recent activity</h2>
          <p>{unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "You're all caught up."}</p>
        </div>
        <button type="button" className="notification-text-button" onClick={handleMarkAllRead} disabled={!unreadCount || markAllBusy}>
          {markAllBusy ? "Marking…" : "Mark all as read"}
        </button>
      </div>

      {realtimeStatus !== "live" && (
        <p className="notifications-live-status" role="status">
          {realtimeStatus === "connecting"
            ? "Connecting to live activity…"
            : "Live updates are unavailable. Use Refresh to check for new activity."}
        </p>
      )}

      {listError && (
        <div className="notifications-state notifications-state-error" role="alert">
          <strong>Notifications couldn't be loaded</strong>
          <p>{listError}</p>
          <button type="button" className="btn btn-primary" onClick={() => refreshNotifications({ includeList: true })} disabled={listLoading}>
            Try again
          </button>
        </div>
      )}

      {listLoading && notifications.length === 0 ? (
        <div className="notifications-state" role="status">
          <span className="notifications-loading-mark" aria-hidden="true"><BellIcon /></span>
          <p>Loading your notifications…</p>
        </div>
      ) : !listError && groups.length === 0 ? (
        <div className="notifications-state notifications-state-empty">
          <span className="notifications-empty-icon" aria-hidden="true"><BellIcon /></span>
          <h2>You're all caught up</h2>
          <p>When someone likes your post, comments, replies, or follows you, their activity will appear here.</p>
        </div>
      ) : (
        <NotificationList
          groups={groups}
          onOpenGroup={handleOpenGroup}
          onOpenItem={handleOpenNotification}
          onMarkItemRead={handleMarkItemRead}
          onMarkGroupRead={handleMarkGroupRead}
        />
      )}

      <p className="notifications-footer-note">
        Grouped activity keeps each individual notification available, so you can mark activities as read one at a time.
      </p>
    </main>
  );
}
