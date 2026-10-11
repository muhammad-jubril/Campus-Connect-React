import { Link, useNavigate } from "react-router-dom";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

const CloseIcon = () => (
  <svg {...iconProps} width="18" height="18" strokeWidth="2.2">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const SearchIcon = () => (
  <svg {...iconProps} width="19" height="19">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const EnterIcon = () => (
  <svg {...iconProps} width="14" height="14" strokeWidth="2.2">
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    <path d="m9 10-5 5 5 5" />
  </svg>
);

const CompassIcon = () => (
  <svg {...iconProps} width="24" height="24">
    <circle cx="12" cy="12" r="9.5" />
    <path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5z" />
  </svg>
);

const TrendIcon = () => (
  <svg {...iconProps} width="16" height="16">
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);

const CalendarIcon = () => (
  <svg {...iconProps} width="16" height="16">
    <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
    <path d="M8 2.5v4M16 2.5v4M3 10h18" />
  </svg>
);

const PeopleIcon = () => (
  <svg {...iconProps} width="16" height="16">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ChatsIcon = () => (
  <svg {...iconProps} width="26" height="26" strokeWidth="1.7">
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 9h8M8 13h5" />
  </svg>
);

const GroupsIcon = () => (
  <svg {...iconProps} width="26" height="26" strokeWidth="1.7">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const CommunitiesIcon = () => (
  <svg {...iconProps} width="26" height="26" strokeWidth="1.7">
    <rect x="3" y="3" width="6" height="6" rx="1.5" />
    <rect x="15" y="3" width="6" height="6" rx="1.5" />
    <rect x="15" y="15" width="6" height="6" rx="1.5" />
    <path d="M9 6h6M18 9v6M15 18H9V9" />
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

const emptyCopy = {
  chats: { title: "No conversations yet", Icon: ChatsIcon },
  groups: { title: "Groups are coming soon", Icon: GroupsIcon },
  communities: { title: "Communities are coming soon", Icon: CommunitiesIcon },
};

// Skeleton previews: shaped like the real content that will live here, so the
// rail already reads as an Explore page while the data is not connected yet.
function ExploreSection({ icon, title, meta, children }) {
  return (
    <section className="explore-section" aria-label={title}>
      <header className="explore-section-head">
        <span className="explore-section-icon">{icon}</span>
        <h3>{title}</h3>
        {meta && <span className="explore-section-meta">{meta}</span>}
      </header>
      <div className="explore-card" aria-hidden="true">{children}</div>
    </section>
  );
}

function ExploreHome() {
  return (
    <div className="explore-body">
      <section className="explore-hero">
        <span className="explore-hero-ring explore-hero-ring-a" aria-hidden="true" />
        <span className="explore-hero-ring explore-hero-ring-b" aria-hidden="true" />
        <div className="explore-hero-top">
          <span className="explore-hero-icon"><CompassIcon /></span>
          <span className="explore-soon-pill">Coming soon</span>
        </div>
        <h3>Discover campus</h3>
        <p>Trending topics, events and communities, all in one place.</p>
      </section>

      <ExploreSection icon={<TrendIcon />} title="What’s happening" meta="Trending">
        {[0, 1, 2].map((row) => (
          <div className="explore-row" key={row}>
            <span className="sk explore-rank" />
            <div className="explore-row-lines">
              <span className="sk explore-line explore-line-a" />
              <span className="sk explore-line explore-line-b" />
            </div>
            <span className="sk explore-count" />
          </div>
        ))}
      </ExploreSection>

      <ExploreSection icon={<CalendarIcon />} title="Upcoming events" meta="This week">
        {[0, 1].map((row) => (
          <div className="explore-row" key={row}>
            <span className="sk explore-date" />
            <div className="explore-row-lines">
              <span className="sk explore-line explore-line-a" />
              <span className="sk explore-line explore-line-c" />
            </div>
          </div>
        ))}
      </ExploreSection>

      <ExploreSection icon={<PeopleIcon />} title="Active communities" meta="Join in">
        {[0, 1, 2].map((row) => (
          <div className="explore-row" key={row}>
            <span className="sk explore-avatar" />
            <div className="explore-row-lines">
              <span className="sk explore-line explore-line-a" />
              <span className="sk explore-line explore-line-c" />
            </div>
            <span className="sk explore-chip" />
          </div>
        ))}
      </ExploreSection>

      <footer className="explore-footer">
        <nav aria-label="Legal and help">
          <Link to="/terms">Terms</Link>
          <span className="explore-footer-dot" aria-hidden="true" />
          <Link to="/privacy">Privacy</Link>
          <span className="explore-footer-dot" aria-hidden="true" />
          <Link to="/help">Help</Link>
        </nav>
        <p>Campus Connect, built for NWU students.</p>
      </footer>
    </div>
  );
}

export default function DesktopRightPanel({ activePanel, onClose }) {
  const navigate = useNavigate();
  // Explore is the permanent right rail on wide desktop. At smaller widths,
  // the rail only opens as an overlay when a navigation destination is chosen.
  const panelKey = activePanel || "explore";
  const panel = panels[panelKey];
  const isOverlayOpen = Boolean(activePanel);
  const empty = emptyCopy[panelKey];

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
        <div className="desktop-panel-topbar">
          <button
            type="button"
            className="desktop-explore-search"
            onClick={() => navigate("/search")}
            aria-label="Search students by name or username"
          >
            <SearchIcon />
            <span>Search students</span>
            <span className="desktop-explore-search-shortcut" aria-hidden="true"><EnterIcon /></span>
          </button>
        </div>

        <header className="desktop-right-panel-head desktop-explore-head">
          <div>
            <span className="eyebrow">{panel.eyebrow}</span>
            <h2 className="display">{panel.title}</h2>
          </div>
          {panelKey !== "explore" && (
            <button type="button" className="desktop-right-panel-close" onClick={onClose} aria-label="Return to Explore">
              <CloseIcon />
            </button>
          )}
        </header>

        {panelKey === "explore" && <ExploreHome />}

        {panelKey === "settings" && (
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
        )}

        {empty && (
          <div className="desktop-panel-empty">
            <div className="desktop-panel-empty-mark" aria-hidden="true"><empty.Icon /></div>
            <h3>{empty.title}</h3>
            <p>{panel.description}</p>
            <span className="desktop-panel-coming-soon">Coming soon</span>
          </div>
        )}
      </aside>
    </>
  );
}
