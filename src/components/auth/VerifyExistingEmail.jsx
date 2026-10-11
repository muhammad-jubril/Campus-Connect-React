import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import BackButton from "../common/BackButton";
import { resendSignupOtp, verifySignupOtp } from "../../services/supabase/auth";
import { useAuth } from "../../hooks/useAuth";
import { useCooldown } from "../../hooks/useCooldown";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE } from "../../utils/validation";

const COOLDOWN_SECONDS = 60;
const PENDING_EMAIL_KEY = "cc_pending_signup_verification_email";

function readPendingSignupEmail() {
  try { return sessionStorage.getItem(PENDING_EMAIL_KEY) || ""; } catch { return ""; }
}

const COOLDOWN_KEY = "cc_verify_existing_email_cooldown_until";

export default function VerifyExistingEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => location.state?.email || readPendingSignupEmail());
  const [sent, setSent] = useState(() => Boolean(readPendingSignupEmail()));
  const [emailError, setEmailError] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [codeError, setCodeError] = useState("");
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRefs = useRef([]);
  const { refreshAuth } = useAuth();
  const { remaining, isCoolingDown, start } = useCooldown(COOLDOWN_SECONDS, COOLDOWN_KEY);
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  useEffect(() => {
    if (location.state?.email) setEmail(location.state.email);
  }, [location.state]);

  async function handleSendCode(event) {
    event?.preventDefault();
    if (sending || checking) return;
    if (isCoolingDown) {
      showToast(`Please wait ${remaining}s before requesting another code`, "error");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      setEmailError(true);
      return;
    }

    setSending(true);
    setEmailError(false);
    try {
      await runWithLoader("Sending verification code…", async () => {
        const result = await resendSignupOtp(normalizedEmail);
        if (result.error) throw result.error;
      });
      setEmail(normalizedEmail);
      try { sessionStorage.setItem(PENDING_EMAIL_KEY, normalizedEmail); } catch { /* optional persistence */ }
      setSent(true);
      setDigits(["", "", "", "", "", ""]);
      setCodeError("");
      start(COOLDOWN_SECONDS);
      showToast("If this email has an unverified account, a new code has been sent.");
    } catch (error) {
      console.error("Resending signup verification code failed:", error);
      showToast(
        error?.message?.toLowerCase().includes("already confirmed")
          ? "This email may already be verified. Try logging in instead."
          : "Couldn't send a verification code. Check the email and try again.",
        "error"
      );
    } finally {
      setSending(false);
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
    if (checking) return;
    const token = digits.join("");
    if (token.length !== 6) {
      setCodeError("Enter the 6-digit code from your email.");
      return;
    }

    setChecking(true);
    setCodeError("");
    try {
      await runWithLoader("Verifying your email…", async () => {
        const { data, error } = await verifySignupOtp({ email, token });
        if (error) throw error;
        if (!data?.session?.user) throw new Error("No verified session was returned.");
      });
      try { sessionStorage.removeItem(PENDING_EMAIL_KEY); } catch { /* optional persistence */ }
      showToast("Email verified. Finish setting up your profile.");
      // SIGNED_IN is intentionally not resolved by AuthContext's event handler;
      // refresh explicitly so interrupted signups reach profile setup.
      await refreshAuth();
    } catch (error) {
      console.error("Existing signup verification failed:", error);
      setCodeError("That code is invalid or has expired. Check it or request a new code.");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setChecking(false);
    }
  }

  return !sent ? (
    <form className="screen-enter" onSubmit={handleSendCode} noValidate>
      <BackButton onClick={() => navigate("/login")} />
      <div className="eyebrow">EMAIL VERIFICATION</div>
      <h2 className="display">Verify your email</h2>
      <p className="subtitle">Enter the email you used to sign up. We'll send another 6-digit code if the account still needs verification.</p>
      <div className={`field ${emailError ? "has-error" : ""}`}>
        <label htmlFor="verify-existing-email">Email address</label>
        <input
          id="verify-existing-email"
          type="email"
          value={email}
          onChange={(event) => { setEmail(event.target.value); setEmailError(false); }}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={emailError}
          aria-describedby={emailError ? "verify-existing-email-error" : undefined}
        />
        {emailError && <p className="signup-email-feedback" id="verify-existing-email-error">Enter a valid email address.</p>}
      </div>
      <div className="spacer" />
      <button type="submit" className="btn btn-primary" disabled={sending || isCoolingDown}>
        {sending ? "Sending code…" : isCoolingDown ? `Wait ${remaining}s` : "Send verification code"}
      </button>
      <p className="link-row">Already verified? <Link to="/login">Log in</Link></p>
    </form>
  ) : (
    <div className="screen-enter">
      <BackButton onClick={() => { try { sessionStorage.removeItem(PENDING_EMAIL_KEY); } catch { /* optional persistence */ } setSent(false); setCodeError(""); }} />
      <div className="eyebrow">EMAIL VERIFICATION</div>
      <h2 className="display">Check your email</h2>
      <p className="subtitle">Enter the 6-digit code sent to <strong>{email}</strong>. Check spam if it doesn't arrive.</p>
      <form onSubmit={handleVerify} noValidate>
        <div className="field">
          <label htmlFor="existing-signup-otp-1">Verification code</label>
          <div className={`otp-row ${checking ? "checking" : ""}`}>
            {digits.map((digit, index) => (
              <input
                key={index}
                id={`existing-signup-otp-${index + 1}`}
                ref={(element) => (inputRefs.current[index] = element)}
                maxLength={1}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                className="otp-digit"
                value={digit}
                disabled={checking}
                aria-label={`Verification code digit ${index + 1}`}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={handlePaste}
              />
            ))}
          </div>
          {codeError && <div className="error" style={{ display: "block" }} role="alert">{codeError}</div>}
        </div>
        <button type="submit" className="btn btn-primary" disabled={checking || digits.some((digit) => !digit)}>
          {checking ? "Verifying…" : "Verify email"}
        </button>
      </form>
      <button type="button" className="btn btn-ghost" onClick={handleSendCode} disabled={isCoolingDown || checking || sending}>
        Resend code {isCoolingDown ? `(${remaining}s)` : ""}
      </button>
      <p className="link-row">Need a different email? <button type="button" className="link-btn" onClick={() => { try { sessionStorage.removeItem(PENDING_EMAIL_KEY); } catch { /* optional persistence */ } setSent(false); setCodeError(""); }}>Change email</button></p>
    </div>
  );
}
