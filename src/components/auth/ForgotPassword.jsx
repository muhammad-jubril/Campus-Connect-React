import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../common/BackButton";
import { resetPasswordForEmail, verifyRecoveryOtp } from "../../services/supabase/auth";
import { classifyAuthError } from "../../utils/authErrors";
import { useCooldown } from "../../hooks/useCooldown";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE } from "../../utils/validation";

const RESET_COOLDOWN_KEY = "cc_reset_cooldown_until";
const RESET_COOLDOWN_SECONDS = 60;
const PENDING_RESET_EMAIL_KEY = "cc_pending_reset_email";

function readPendingResetEmail() {
  try { return sessionStorage.getItem(PENDING_RESET_EMAIL_KEY) || ""; } catch { return ""; }
}

const GENERIC_MESSAGE = "If an account exists for this email, a 6-digit reset code has been sent.";

export default function ForgotPassword() {
  const [email, setEmail] = useState(() => readPendingResetEmail());
  const [sent, setSent] = useState(() => Boolean(readPendingResetEmail()));
  const [error, setError] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [codeError, setCodeError] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const { beginRecovery } = useAuth();
  const { remaining, isCoolingDown, start } = useCooldown(
    RESET_COOLDOWN_SECONDS,
    RESET_COOLDOWN_KEY
  );
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  async function requestCode(event) {
    event?.preventDefault();
    if (isCoolingDown) {
      showToast(`Please wait ${remaining}s before requesting another code`, "error");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      setError(true);
      showToast("Enter a valid email", "error");
      return;
    }

    setError(false);
    try {
      let result;
      await runWithLoader("Sending reset code…", async () => {
        result = await resetPasswordForEmail(normalizedEmail);
      });

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
        // Keep account existence private if Supabase returns a no-user error.
        if (resetError.code !== "user_not_found") {
          showToast("Couldn't send a reset code right now. Please try again.", "error");
          return;
        }
      }

      setEmail(normalizedEmail);
      try { sessionStorage.setItem(PENDING_RESET_EMAIL_KEY, normalizedEmail); } catch { /* optional persistence */ }
      setSent(true);
      setDigits(["", "", "", "", "", ""]);
      setCodeError("");
      start(RESET_COOLDOWN_SECONDS);
    } catch (requestError) {
      const kind = classifyAuthError(requestError);
      if (kind === "network") {
        showToast("Can't connect. Check your internet.", "error");
      } else if (kind === "rate-limited") {
        showToast("Too many requests. Please wait before trying again.", "error");
      } else {
        showToast("Couldn't send a reset code right now. Please try again.", "error");
      }
    }
  }

  function updateDigit(index, raw) {
    const value = raw.replace(/[^0-9]/g, "").slice(-1);
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setCodeError("");
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    const next = pasted.split("");
    while (next.length < 6) next.push("");
    setDigits(next);
    setCodeError("");
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (checkingCode) return;
    const token = digits.join("");
    if (token.length !== 6) {
      setCodeError("Enter the 6-digit code from your email.");
      return;
    }

    setCheckingCode(true);
    setCodeError("");
    try {
      await runWithLoader("Verifying reset code…", async () => {
        const result = await verifyRecoveryOtp({ email, token });
        if (result.error) throw result.error;
        if (!result.data?.session?.user) {
          throw new Error("The code could not start a password-reset session.");
        }
      });

      // Supabase normally emits PASSWORD_RECOVERY for this verification. Set
      // the state explicitly as well, so the app does not depend on event timing.
      try { sessionStorage.removeItem(PENDING_RESET_EMAIL_KEY); } catch { /* optional persistence */ }
      beginRecovery();
    } catch (verifyError) {
      console.error("Password recovery code verification failed:", verifyError);
      const kind = classifyAuthError(verifyError);
      setCodeError(
        kind === "rate-limited"
          ? "Too many attempts. Wait a little before trying again."
          : "That code is invalid or has expired. Check it or request a new code."
      );
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setCheckingCode(false);
    }
  }

  function handleStartOver() {
    try { sessionStorage.removeItem(PENDING_RESET_EMAIL_KEY); } catch { /* optional persistence */ }
    setSent(false);
    setDigits(["", "", "", "", "", ""]);
    setCodeError("");
  }

  return !sent ? (
    <form className="screen-enter" onSubmit={requestCode} noValidate>
      <BackButton onClick={() => navigate("/login")} />
      <h2 className="display">Reset your password</h2>
      <p className="subtitle">Enter your email and we'll send you a 6-digit reset code.</p>

      <div className={`field ${error ? "has-error" : ""}`}>
        <label htmlFor="forgot-email">Email</label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(false);
          }}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error}
        />
      </div>

      <div className="spacer" />
      <button type="submit" className="btn btn-primary" disabled={isCoolingDown}>
        {isCoolingDown ? `Send reset code (${remaining}s)` : "Send reset code"}
      </button>
    </form>
  ) : (
    <div className="screen-enter">
      <BackButton onClick={handleStartOver} />
      <div className="eyebrow">PASSWORD RESET</div>
      <h2 className="display">Check your email</h2>
      <p className="subtitle">
        {GENERIC_MESSAGE} Check your inbox and spam folder for <strong>{email}</strong>.
      </p>

      <form onSubmit={handleVerify} noValidate>
        <div className="field">
          <label htmlFor="recovery-otp-1">6-digit reset code</label>
          <div className={`otp-row ${checkingCode ? "checking" : ""}`}>
            {digits.map((digit, index) => (
              <input
                key={index}
                id={`recovery-otp-${index + 1}`}
                ref={(element) => (inputRefs.current[index] = element)}
                maxLength={1}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                className="otp-digit"
                value={digit}
                disabled={checkingCode}
                aria-label={`Reset code digit ${index + 1}`}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={handlePaste}
              />
            ))}
          </div>
          {codeError && <div className="error" style={{ display: "block" }} role="alert">{codeError}</div>}
        </div>

        <button type="submit" className="btn btn-primary" disabled={checkingCode || digits.some((digit) => !digit)}>
          {checkingCode ? "Verifying code…" : "Verify code"}
        </button>
      </form>

      <button
        type="button"
        className="btn btn-ghost"
        disabled={isCoolingDown || checkingCode}
        onClick={() => requestCode()}
      >
        Resend code {isCoolingDown ? `(${remaining}s)` : ""}
      </button>
      <p className="link-row">Wrong email? <button type="button" className="link-btn" onClick={handleStartOver}>Change email</button></p>
    </div>
  );
}
