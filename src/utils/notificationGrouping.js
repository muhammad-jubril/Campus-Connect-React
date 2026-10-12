const TYPE_ALIASES = Object.freeze({
  like: "like",
  post_like: "like",
  comment: "comment",
  post_comment: "comment",
  reply: "reply",
  comment_reply: "reply",
  follow: "follow",
  followed: "follow",
  new_follower: "follow",
});

export function normalizeNotificationType(type) {
  return TYPE_ALIASES[String(type || "").toLowerCase()] || "activity";
}

function postIdOf(notification) {
  return notification.post_id || (
    notification.target_type === "post" ? notification.target_id : null
  );
}

function threadIdOf(notification) {
  return notification.comment_id || notification.thread_id || (
    notification.target_type === "comment" ? notification.target_id : null
  );
}

function safeTime(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function groupingKey(notification) {
  const type = normalizeNotificationType(notification.type);
  if (type === "like" || type === "comment") {
    const postId = postIdOf(notification);
    return postId ? `${type}:post:${postId}` : `single:${notification.id}`;
  }

  if (type === "reply") {
    const threadId = threadIdOf(notification);
    // Without a comment/thread ID, do not incorrectly merge unrelated replies.
    return threadId ? `reply:thread:${threadId}` : `single:${notification.id}`;
  }

  if (type === "follow") {
    const day = new Date(safeTime(notification.created_at)).toISOString().slice(0, 10);
    return `follow:day:${day}`;
  }

  return `single:${notification.id}`;
}

function actorIdentity(notification) {
  return notification.actor?.id || notification.actor_id || `notification:${notification.id}`;
}

export function groupNotifications(notifications = []) {
  const groupsByKey = new Map();
  const sorted = [...notifications].sort((a, b) => safeTime(b.created_at) - safeTime(a.created_at));

  for (const notification of sorted) {
    const key = groupingKey(notification);
    const type = normalizeNotificationType(notification.type);
    let group = groupsByKey.get(key);

    if (!group) {
      group = {
        key,
        type,
        items: [],
        actors: [],
        isUnread: false,
        latestAt: notification.created_at || null,
        postId: postIdOf(notification),
        commentId: threadIdOf(notification),
      };
      groupsByKey.set(key, group);
    }

    group.items.push(notification);
    group.isUnread ||= !notification.read;
    if (safeTime(notification.created_at) > safeTime(group.latestAt)) {
      group.latestAt = notification.created_at;
    }
  }

  const groups = [...groupsByKey.values()];
  for (const group of groups) {
    const actorsById = new Map();
    for (const item of group.items) {
      const id = actorIdentity(item);
      if (!actorsById.has(id)) {
        actorsById.set(id, {
          id,
          ...(item.actor || {}),
          username: item.actor?.username || item.actor_username || null,
          name: item.actor?.name || item.actor?.username || item.actor_name || item.actor_username || "A student",
          avatar_url: item.actor?.avatar_url || item.actor_avatar_url || null,
        });
      }
    }
    group.actors = [...actorsById.values()];
    group.unreadCount = group.items.filter((item) => !item.read).length;
  }

  return groups.sort((a, b) => safeTime(b.latestAt) - safeTime(a.latestAt));
}

export function notificationSummary(group) {
  const type = group?.type || "activity";
  const actors = group?.actors || [];
  const firstName = actors[0]?.name || actors[0]?.username || "A student";
  const actorPhrase = actors.length > 1
    ? `${firstName} and ${actors.length - 1} ${actors.length - 1 === 1 ? "other" : "others"}`
    : firstName;

  if (type === "like") return `${actorPhrase} liked your post.`;
  if (type === "comment") return `${actorPhrase} commented on your post.`;
  if (type === "reply") return `${actorPhrase} replied to your comment.`;
  if (type === "follow") return `${actorPhrase} started following you.`;
  return actors.length > 1 ? `${actorPhrase} interacted with your content.` : `${firstName} interacted with your content.`;
}

export function notificationActorText(notification) {
  const actor = notification?.actor?.name || notification?.actor?.username || "A student";
  const type = normalizeNotificationType(notification?.type);
  if (type === "like") return `${actor} liked your post`;
  if (type === "comment") return `${actor} commented on your post`;
  if (type === "reply") return `${actor} replied to your comment`;
  if (type === "follow") return `${actor} started following you`;
  return `${actor} interacted with your content`;
}

export function notificationDestination(notification) {
  const type = normalizeNotificationType(notification?.type);

  if (type === "follow") {
    const username = notification?.actor?.username || notification?.actor_username;
    return username ? `/profile/${encodeURIComponent(username)}` : null;
  }

  const postId = postIdOf(notification);
  if (postId) {
    const anchor = type === "comment" || type === "reply" ? "#comments" : "";
    return `/post/${encodeURIComponent(postId)}${anchor}`;
  }

  const username = notification?.target_username || notification?.actor?.username;
  return username ? `/profile/${encodeURIComponent(username)}` : null;
}

export function formatNotificationTime(value) {
  const time = safeTime(value);
  if (!time) return "Just now";
  const elapsed = Math.max(0, Date.now() - time);
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(time));
}
