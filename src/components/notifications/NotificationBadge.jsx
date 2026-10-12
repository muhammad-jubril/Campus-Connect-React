import { useNotifications } from "../../hooks/useNotifications";

export default function NotificationBadge() {
  const { unreadCount } = useNotifications();
  const visible = unreadCount > 0;
  const shownCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <span
      className={`nav-badge${visible ? " show has-count" : ""}`}
      aria-label={visible ? `${unreadCount} unread notifications` : undefined}
      aria-hidden={!visible}
      style={visible ? {
        width: "auto",
        minWidth: 17,
        height: 17,
        padding: "0 4px",
        display: "grid",
        placeItems: "center",
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1,
        color: "#fff",
        background: "var(--accent-red)",
      } : undefined}
    >
      {visible ? shownCount : ""}
    </span>
  );
}
