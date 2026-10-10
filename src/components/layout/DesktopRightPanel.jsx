const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4z" />
    <path fill="currentColor" d="M18.6 5 6 17.6 4.6 16.2 17.2 3.6z" />
  </svg>
);

const panels = {
  chats: {
    eyebrow: "MESSAGES",
    title: "Chats",
    description: "Your conversations will appear here when student messaging is available.",
    items: [],
  },
  groups: {
    eyebrow: "CAMPUS",
    title: "Groups",
    description: "Your groups and memberships will appear here once groups are available.",
    items: [],
  },
  communities: {
    eyebrow: "CAMPUS",
    title: "Communities",
    description: "Discover campus interests and communities here when this feature is ready.",
    items: [],
  },
  settings: {
    eyebrow: "YOUR ACCOUNT",
    title: "Settings",
    description: "Account preferences and privacy controls are being prepared.",
    items: ["Profile preferences", "Privacy & security", "Notification preferences"],
  },
};

export default function DesktopRightPanel({ activePanel, onClose }) {
  const panel = panels[activePanel];
  if (!panel) return null;

  return (
    <>
      <button
        type="button"
        className="desktop-right-panel-scrim"
        onClick={onClose}
        aria-label={`Close ${panel.title} panel`}
        tabIndex={-1}
      />
      <aside className={`desktop-right-panel panel-${activePanel}`} aria-label={`${panel.title} panel`}>
        <header className="desktop-right-panel-head">
          <div>
            <span className="eyebrow">{panel.eyebrow}</span>
            <h2 className="display">{panel.title}</h2>
          </div>
          <button type="button" className="desktop-right-panel-close" onClick={onClose} aria-label={`Close ${panel.title} panel`}>
            <CloseIcon />
          </button>
        </header>

        {activePanel === "settings" ? (
          <>
            <p className="desktop-panel-settings-note">{panel.description}</p>
            <div className="desktop-panel-settings-list">
              {panel.items.map((item) => (
                <div className="desktop-panel-setting" key={item}>
                  <span>{item}</span>
                  <span className="desktop-panel-coming-soon">Coming soon</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="desktop-panel-empty">
            <div className="desktop-panel-empty-mark" aria-hidden="true">
              {activePanel === "chats" ? "•••" : activePanel === "groups" ? "◎" : "◌"}
            </div>
            <h3>{activePanel === "chats" ? "No conversations yet" : activePanel === "groups" ? "Groups are coming soon" : "Communities are coming soon"}</h3>
            <p>{panel.description}</p>
            <span className="desktop-panel-coming-soon">Coming soon</span>
          </div>
        )}
      </aside>
    </>
  );
}
