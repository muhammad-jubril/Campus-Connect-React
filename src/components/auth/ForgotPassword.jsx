import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../common/BackButton";
import { resetPasswordForEmail } from "../../services/supabase/auth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE } from "../../utils/validation";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  async function handleSend() {
    if (!EMAIL_RE.test(email)) {
      setError(true);
      showToast("Enter a valid email", "error");
      return;
    }
    await runWithLoader("Sending reset link…", async () => {
      await resetPasswordForEmail(email);
    });
    // Same message regardless of whether the email actually has an
    // account — telling the truth here would let someone probe for which
    // emails are registered.
    showToast("If that email has an account, a reset link has been sent");
    navigate("/login");
  }

  return (
    <div className="screen-enter">
      <BackButton onClick={() => navigate("/login")} />
      <h2 className="display">Reset your password</h2>
      <p className="subtitle">Enter your email and we'll send you a reset link.</p>

      <div className={`field ${error ? "has-error" : ""}`}>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(false); }} placeholder="you@example.com" autoComplete="email" />
      </div>

      <div className="spacer" />
      <button type="button" className="btn btn-primary" onClick={handleSend}>Send reset link</button>
    </div>
  );
}
