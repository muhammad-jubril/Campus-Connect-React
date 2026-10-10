import { useNavigate } from "react-router-dom";

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4z" />
    <path fill="currentColor" d="M18.6 5 6 17.6l-1.4-1.4L17.2 3.6z" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

const panels = {
  explore: {
    eyebrow: "CAMPUS CONNECT",
    title: "Explore",
    description: "Discover what students are talking about across campus.",
  },
  chats: {
    eyebrow: "MESSAGES",
    title: "Chats",
    description: "Your conversations will appear here when student messaging is available.",
  },
  groups: {
    eyebrow: "CAMPUS",
    title: "Groups",
    description: "Your groups and memberships will appear here once groups are available.",
  },
  communities: {
    eyebrow: "CAMPUS",
    title: "Communities",
    description: "Discover campus interests and communities here when this feature is ready.",
  },
  settings: {
    eyebrow: "YOUR ACCOUNT",
    title: "Settings",
    description: "Account preferences and privacy controls are being prepared.",
  },
};

export default function DesktopRightPanel({ activePanel, onClose }) {
  const navigate = useNavigate();
  // Explore is the permanent right rail on wide desktop. At smaller widths,
  // the rail only opens as an overlay when a navigation destination is chosen.
  const panelKey = activePanel || "explore";
  const panel = panels[panelKey];
  const isOverlayOpen = Boolean(activePanel);

  return (
    <>
      <button
        type="button"
        className={`desktop-right-panel-scrim${isOverlayOpen ? " is-open" : ""}`}
        onClick={onClose}
        aria-label={`Close ${panel.title} panel`}
        tabIndex={-1}
      />
      <aside
        className={`desktop-right-panel panel-${panelKey}${isOverlayOpen ? " is-open" : ""}`}
        aria-label={`${panel.title} panel`}
      >
        {panelKey === "explore" ? (
          <>
            <button
              type="button"
              className="desktop-explore-search"
              onClick={() => navigate("/search")}
              aria-label="Search students by name or username"
            >
              <SearchIcon />
              <span>Search students</span>
              <span className="desktop-explore-search-shortcut" aria-hidden="true">↵</span>
            </button>

            <header className="desktop-right-panel-head desktop-explore-head">
              <div>
                <span className="eyebrow">{panel.eyebrow}</span>
                <h2 className="display">Explore</h2>
              </div>
            </header>

            <section className="desktop-explore-trending" aria-labelledby="desktop-explore-trending-title">
              <div className="desktop-explore-trending-head">
                <h3 id="desktop-explore-trending-title">What’s happening</h3>
                <span className="desktop-explore-trending-label">Trending</span>
              </div>
              <div className="desktop-explore-trending-empty">
                <span className="desktop-panel-coming-soon">Coming soon</span>
                <p>Trending topics will appear here once campus activity data is connected.</p>
              </div>
            </section>
          </>
        ) : (
          <>
            <header className="desktop-right-panel-head">
              <div>
                <span className="eyebrow">{panel.eyebrow}</span>
                <h2 className="display">{panel.title}</h2>
              </div>
              <button type="button" className="desktop-right-panel-close" onClick={onClose} aria-label="Return to Explore">
                <CloseIcon />
              </button>
            </header>

            {panelKey === "settings" ? (
              <>
                <p className="desktop-panel-settings-note">{panel.description}</p>
                <div className="desktop-panel-settings-list">
                  {["Profile preferences", "Privacy & security", "Notification preferences"].map((item) => (
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
                  {panelKey === "chats" ? "•••" : panelKey === "groups" ? "◎" : "◌"}
                </div>
                <h3>{panelKey === "chats" ? "No conversations yet" : panelKey === "groups" ? "Groups are coming soon" : "Communities are coming soon"}</h3>
                <p>{panel.description}</p>
                <span className="desktop-panel-coming-soon">Coming soon</span>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}
