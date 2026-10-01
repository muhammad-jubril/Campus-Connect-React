// Mobile-only back arrow (hidden on desktop via .auth-form-panel
// .btn-back-inline in globals.css, since the split-panel layout doesn't
// need in-form back navigation — the whole brand panel makes "back"
// unambiguous, and React Router's own back is always available).
export default function BackButton({ onClick, label = "Go back" }) {
  return (
    <button type="button" className="btn-back-inline" aria-label={label} onClick={onClick}
      style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(28,27,23,0.05)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 12 }}>
      <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.5 4.5 8 12l7.5 7.5 1.4-1.4L10.8 12l6.1-6.1z" /></svg>
    </button>
  );
}
