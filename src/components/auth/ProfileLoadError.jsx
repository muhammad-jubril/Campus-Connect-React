import { useAuth } from "../../hooks/useAuth";

export default function ProfileLoadError() {
  const { refreshAuth, logout } = useAuth();

  return (
    <div className="screen-enter">
      <div className="eyebrow">CAMPUS CONNECT</div>
      <h2 className="display">Can't reach Campus Connect.</h2>
      <p className="subtitle">Check your connection.</p>

      <div className="spacer" />

      <button type="button" className="btn btn-primary" onClick={refreshAuth}>
        Try again
      </button>
      <button type="button" className="btn btn-ghost" onClick={logout}>
        Log out
      </button>
    </div>
  );
}
