import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Brief congratulatory moment after finishing signup, then auto-advances
// into the real feed — matches the vanilla build's 2.6s timed transition.
export default function WelcomePage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate("/feed", { replace: true }), 2600);
    return () => clearTimeout(t);
  }, [navigate]);

  const firstName = currentUser ? currentUser.name.split(" ")[0] : "Student";

  return (
    <div className="post-signup-welcome" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="welcome-wrap" style={{ justifyContent: "center", flex: 1 }}>
        <div className="welcome-check">
          <svg viewBox="0 0 40 40" width="64" height="64">
            <circle className="loader-check-circle" cx="20" cy="20" r="20" />
            <path className="welcome-check-path" d="M11 21l6 6 12-13" />
          </svg>
        </div>
        <h1 className="welcome-title"><span className="welcome-title-line">You're in.</span></h1>
        <p className="welcome-subtitle">Welcome to the community, {firstName}.</p>
        <p className="welcome-blurb welcome-blurb-center">Your campus just got a little more connected.</p>
      </div>
    </div>
  );
}
