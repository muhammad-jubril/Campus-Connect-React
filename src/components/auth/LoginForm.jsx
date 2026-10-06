import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE, joinList } from "../../utils/validation";

const AUTH_ERROR_MESSAGES = {
  "invalid-credentials": "Wrong email or password",
  "email-not-confirmed": "Your email isn't verified yet. Create your account again to get a new code.",
  "rate-limited": "Too many attempts. Wait a few minutes and try again.",
  network: "Can't connect. Check your internet and try again.",
  unknown: "Something went wrong. Please try again.",
};

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authErrorKind, setAuthErrorKind] = useState("");
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
      setAuthErrorKind("");
      showToast(`Enter ${joinList(missing)} to log in`, "error");
      return;
    }

    setSubmitting(true);
    setAuthErrorKind("");

    try {
      await runWithLoader("Logging you in…", async () => {
        await login(email, password);
      });
      showToast("Logged in");
    } catch (err) {
      console.error("Login failed:", err);
      const kind = AUTH_ERROR_MESSAGES[err?.message]
        ? err.message
        : "unknown";
      setAuthErrorKind(kind);
      showToast(AUTH_ERROR_MESSAGES[kind], "error");
    } finally {
      setSubmitting(false);
    }
  }

  const showEmailError = authErrorKind === "invalid-credentials";
  const showUnverifiedMessage = authErrorKind === "email-not-confirmed";

  return (
    <div className="screen-enter">
      <h2 className="display">Welcome back</h2>
      <p className="subtitle">Log in with your email.</p>

      <div className={`field ${showEmailError ? "has-error" : ""}`}>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setAuthErrorKind("");
          }}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>

      <div className="field">
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setAuthErrorKind("");
          }}
          placeholder="Your password"
        />
      </div>

      {showUnverifiedMessage && (
        <p
          className="error"
          style={{
            display: "block",
            color: "var(--accent-red)",
            fontSize: 12,
            lineHeight: 1.45,
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          Your email isn't verified yet. {""}
          <Link to="/signup" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Create your account again to get a new code.
          </Link>
        </p>
      )}

      <p className="link-row" style={{ marginTop: -8, marginBottom: 20, textAlign: "right" }}>
        <Link to="/forgot-password">Forgot password?</Link>
      </p>

      <div className="spacer" />
      <button type="button" className="btn btn-primary" onClick={handleLogin} disabled={submitting}>
        Log in
      </button>
      <p className="link-row">New here? <Link to="/signup">Create an account</Link></p>
    </div>
  );
}
