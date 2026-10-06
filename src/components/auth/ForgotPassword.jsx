import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../common/BackButton";
import { resetPasswordForEmail } from "../../services/supabase/auth";
import { classifyAuthError } from "../../utils/authErrors";
import { useCooldown } from "../../hooks/useCooldown";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE } from "../../utils/validation";

const RESET_COOLDOWN_KEY = "cc_reset_cooldown_until";
const RESET_COOLDOWN_SECONDS = 60;
const GENERIC_MESSAGE = "If that email has an account, a reset link has been sent";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const { remaining, isCoolingDown, start } = useCooldown(
    RESET_COOLDOWN_SECONDS,
    RESET_COOLDOWN_KEY
  );
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  async function handleSend() {
    if (isCoolingDown) {
      showToast(`Please wait ${remaining}s before requesting another link`, "error");
      return;
    }

    if (!EMAIL_RE.test(email)) {
      setError(true);
      showToast("Enter a valid email", "error");
      return;
    }

    setError(false);

    let result;

    try {
      await runWithLoader("Sending reset link…", async () => {
        result = await resetPasswordForEmail(email);
      });
    } catch (err) {
      const kind = classifyAuthError(err);

      if (kind === "network") {
        showToast("Can't connect. Check your internet.", "error");
        return;
      }

      if (kind === "rate-limited") {
        showToast("Too many requests. Please wait before trying again.", "error");
        return;
      }

      showToast("Something went wrong. Please try again.", "error");
      return;
    }

    const resetError = result?.error;

    if (resetError) {
      const kind = classifyAuthError(resetError);

      if (kind === "network") {
        showToast("Can't connect. Check your internet.", "error");
        return;
      }

      if (kind === "rate-limited") {
        showToast("Too many requests. Please wait before trying again.", "error");
        return;
      }

      // Preserve anti-enumeration. A no-user outcome is deliberately treated
      // exactly like a successful request. Supabase can also surface this as
      // the stable `user_not_found` auth code in some flows.
      if (resetError.code !== "user_not_found") {
        showToast("Something went wrong. Please try again.", "error");
        return;
      }
    }

    start(RESET_COOLDOWN_SECONDS);
    showToast(GENERIC_MESSAGE);
    navigate("/login");
  }

  return (
    <div className="screen-enter">
      <BackButton onClick={() => navigate("/login")} />
      <h2 className="display">Reset your password</h2>
      <p className="subtitle">Enter your email and we'll send you a reset link.</p>

      <div className={`field ${error ? "has-error" : ""}`}>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(false);
          }}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>

      <div className="spacer" />
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSend}
        disabled={isCoolingDown}
      >
        {isCoolingDown ? `Send reset link (${remaining}s)` : "Send reset link"}
      </button>
    </div>
  );
}
