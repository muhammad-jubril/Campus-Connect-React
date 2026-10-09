import MobileMenuButton from "../components/layout/MobileMenuButton";

export default function ComingSoonPage({ title, eyebrow, icon, blurb, shell = false }) {
  if (!shell) {
    return (
      <div style={{ padding: 24 }}>
        <h2 className="display" style={{ marginBottom: 8 }}>{title}</h2>
        <div className="empty-state" style={{ paddingTop: 64 }}>
          <div className="empty-state-icon">{icon}</div>
          <span className="empty-state-tag">Coming soon</span>
          <p className="subtitle" style={{ marginBottom: 0, maxWidth: 260 }}>{blurb}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell-coming-soon">
      <div className="screen-inline-header">
        <MobileMenuButton />
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 className="display">{title}</h2>
        </div>
        <span className="header-status-dot" aria-hidden="true" />
      </div>

      <div className="empty-state shell-coming-soon-empty">
        <div className="empty-state-icon">{icon}</div>
        <span className="empty-state-tag">Coming soon</span>
        <p className="subtitle" style={{ marginBottom: 0, maxWidth: 260 }}>{blurb}</p>
      </div>
    </div>
  );
}
