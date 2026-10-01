// Shared shell for every auth screen (login, signup steps, forgot/reset
// password) — the desktop split-panel (brand half + form half). On
// mobile the brand half just doesn't render (see .auth-brand-panel in
// globals.css), so this component works unmodified at every width.
export default function AuthLayout({ children }) {
  return (
    <div className="screen-auth" style={{ display: "flex", flex: 1 }}>
      <div className="auth-brand-panel">
        <div className="auth-brand-halo" />
        <div className="auth-brand-content">
          <img src="/icons/icon-192.png" alt="" className="brand-dot-lg" />
          <h2 className="auth-brand-title">Campus Connect</h2>
          <p className="auth-brand-tagline">A place where campus life connects.</p>
          <p className="auth-brand-blurb">
            Everything scattered across WhatsApp groups and noticeboards —
            campus chatter, events, buying and selling, community life — in
            one place built for NWU students.
          </p>
        </div>
      </div>
      <div className="auth-form-panel" style={{ display: "flex", flexDirection: "column", flex: 1, padding: "24px 20px" }}>
        {children}
      </div>
    </div>
  );
}
