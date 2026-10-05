export default function MobileMenuButton({ label = "Open menu" }) {
  return (
    <button
      type="button"
      className="mobile-menu-toggle"
      aria-label={label}
      onClick={() => window.dispatchEvent(new Event("campus-connect:open-drawer"))}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
