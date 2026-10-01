// Reused for every feature not ported to React yet — same "Coming soon"
// empty-state pattern the vanilla build already uses for its own
// not-yet-built screens (Marketplace, Communities, etc. before they
// were built out).
export default function ComingSoonPage({ title, icon, blurb }) {
  return (
    <div style={{ padding: 24 }}>
      <h2 className="display" style={{ marginBottom: 8 }}>{title}</h2>
      <div className="empty-state" style={{ paddingTop: 64 }}>
        <div className="empty-state-icon">{icon}</div>
        <span className="empty-state-tag">Not ported yet</span>
        <p className="subtitle" style={{ marginBottom: 0, maxWidth: 260 }}>{blurb}</p>
      </div>
    </div>
  );
}
