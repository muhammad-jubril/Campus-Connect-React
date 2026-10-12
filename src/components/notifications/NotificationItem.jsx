import { useState } from "react";
import {
  formatNotificationTime,
  notificationActorText,
  notificationSummary,
} from "../../utils/notificationGrouping";

function ActorAvatar({ actor }) {
  if (actor?.avatar_url) {
    return <img className="notification-avatar" src={actor.avatar_url} alt="" loading="lazy" />;
  }
  const initial = (actor?.name || actor?.username || "S").trim().charAt(0).toUpperCase();
  return <span className="notification-avatar notification-avatar-fallback" aria-hidden="true">{initial}</span>;
}

export default function NotificationItem({ group, onOpenGroup, onOpenItem, onMarkItemRead, onMarkGroupRead }) {
  const [expanded, setExpanded] = useState(false);
  const previewActors = group.actors.slice(0, 3);

  return (
    <article className={`notification-card${group.isUnread ? " is-unread" : ""}`}>
      <button
        type="button"
        className="notification-summary-button"
        onClick={() => onOpenGroup(group)}
        aria-label={`Open notification: ${notificationSummary(group)}`}
      >
        <span className="notification-avatars" aria-hidden="true">
          {previewActors.map((actor, index) => (
            <span className="notification-avatar-wrap" key={`${actor.id}-${index}`}>
              <ActorAvatar actor={actor} />
            </span>
          ))}
          {group.actors.length > 3 && (
            <span className="notification-avatar notification-avatar-extra">+{group.actors.length - 3}</span>
          )}
        </span>
        <span className="notification-summary-copy">
          <span className="notification-summary-text">{notificationSummary(group)}</span>
          <time className="notification-time" dateTime={group.latestAt || undefined}>
            {formatNotificationTime(group.latestAt)}
          </time>
        </span>
        {group.isUnread && <span className="notification-unread-dot" aria-label="Unread" />}
      </button>

      <div className="notification-item-actions">
        {group.items.length > 1 && (
          <button
            type="button"
            className="notification-text-button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide activity" : `View activity (${group.items.length})`}
          </button>
        )}
        {group.isUnread && (
          <button type="button" className="notification-text-button" onClick={() => onMarkGroupRead(group)}>
            {group.items.length > 1 ? "Mark group read" : "Mark as read"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="notification-activity-list" aria-label="Individual activity records">
          {group.items.map((notification) => (
            <div className={`notification-activity-row${notification.read ? "" : " is-unread"}`} key={notification.id}>
              <ActorAvatar actor={notification.actor} />
              <button type="button" className="notification-activity-open" onClick={() => onOpenItem(notification)}>
                <span>{notificationActorText(notification)}</span>
                <time dateTime={notification.created_at || undefined}>{formatNotificationTime(notification.created_at)}</time>
              </button>
              {!notification.read && (
                <button
                  type="button"
                  className="notification-mark-one"
                  onClick={() => onMarkItemRead(notification)}
                  aria-label={`Mark ${notification.actor?.name || "this notification"} as read`}
                  title="Mark as read"
                >
                  <span aria-hidden="true">✓</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
