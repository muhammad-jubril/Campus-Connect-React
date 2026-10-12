import NotificationItem from "./NotificationItem";

export default function NotificationList({
  groups,
  onOpenGroup,
  onOpenItem,
  onMarkItemRead,
  onMarkGroupRead,
}) {
  if (!groups.length) return null;

  return (
    <div className="notifications-list">
      {groups.map((group) => (
        <NotificationItem
          key={group.key}
          group={group}
          onOpenGroup={onOpenGroup}
          onOpenItem={onOpenItem}
          onMarkItemRead={onMarkItemRead}
          onMarkGroupRead={onMarkGroupRead}
        />
      ))}
    </div>
  );
}
