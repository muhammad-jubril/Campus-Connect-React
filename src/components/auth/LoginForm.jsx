import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE, joinList } from "../../utils/validation";

// Note what this DOESN'T need to handle: a verified account with no
// profile row yet. AuthContext's login() already detects that and flips
// `status` to NEEDS_PROFILE_SETUP, which AppRoutes reacts to on its own —
// this form only ever needs to care about "did signInWithPassword work".
export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  async function handleLogin() {
    if (submitting) return;
    const missing = [];
    if (!EMAIL_RE.test(email)) missing.push("your email");
    if (!password) missing.push("your password");
    if (missing.length > 0) {
      setError(true);
      showToast(`Enter ${joinList(missing)} to log in`, "error");
      return;
    }

    setSubmitting(true);
    try {
      await runWithLoader("Logging you in…", async () => {
        await login(email, password);
      });
      showToast("Logged in");
      // No navigate() here — AppRoutes redirects on its own once `status`
      // updates, whether that's straight to the feed or into profile setup.
    } catch (err) {
      console.error("Login failed:", err);
      setError(true);
      showToast("Wrong email or password", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen-enter">
      <h2 className="display">Welcome back</h2>
      <p className="subtitle">Log in with your email.</p>

      <div className={`field ${error ? "has-error" : ""}`}>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(false); }} placeholder="you@example.com" autoComplete="email" />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
      </div>
      <p className="link-row" style={{ marginTop: -8, marginBottom: 20, textAlign: "right" }}>
        <Link to="/forgot-password">Forgot password?</Link>
      </p>

      <div className="spacer" />
      <button type="button" className="btn btn-primary" onClick={handleLogin}>Log in</button>
      <p className="link-row">New here? <Link to="/signup">Create an account</Link></p>
    </div>
  );
}
