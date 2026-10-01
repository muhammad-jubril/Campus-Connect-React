import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="screen-welcome" style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
      <div className="welcome-float-icons" aria-hidden="true">
        <svg className="wf-icon wf-icon-1" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <svg className="wf-icon wf-icon-2" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        <svg className="wf-icon wf-icon-3" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 10 12 4 2 10l10 6 10-6Z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></svg>
        <svg className="wf-icon wf-icon-4" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6C3.2 5.9 5.4 4 7.9 4c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2 2.5 0 4.5 1.9 4.5 4.6z" /></svg>
        <svg className="wf-icon wf-icon-5" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg>
      </div>

      <div className="welcome-wrap">
        <div className="welcome-mark">
          <div className="welcome-halo" />
          <div className="welcome-logo-frame">
            <img src="/campus-connect-logo.png" alt="Campus Connect" className="welcome-logo" />
          </div>
        </div>
        <h1 className="welcome-title">
          <span className="welcome-title-line">Welcome to</span>
          <span className="welcome-title-line welcome-title-shine">Campus Connect</span>
        </h1>
        <p className="welcome-subtitle">A place where campus life connects.<span className="welcome-underline" /></p>
        <p className="welcome-blurb">
          Everything scattered across WhatsApp groups and noticeboards —
          campus chatter, events, buying and selling, community life — in one
          place built for NWU students.
        </p>
        <div className="spacer" />
        <Link to="/signup" className="btn btn-primary welcome-btn-shine">Join campus life</Link>
        <Link to="/login" className="btn btn-outline">Already have an account? Log in</Link>
        <p className="welcome-legal">
          By continuing, you agree to our{" "}
          <Link to="/terms">Terms of Use</Link> and{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
