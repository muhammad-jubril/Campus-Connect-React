import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BackButton from "../common/BackButton";
import { useToast } from "../../hooks/useToast";
import { checkSignupEmail } from "../../services/supabase/auth";
import { EMAIL_RE } from "../../utils/validation";

export default function EmailVerification({ initialEmail, onNext, onBack }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [emailError, setEmailError] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const { showToast } = useToast();

  useEffect(() => {
    if (retryAfter <= 0) return undefined;
    const timer = window.setTimeout(() => setRetryAfter((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  async function handleContinue(event) {
    event.preventDefault();
    if (checkingEmail || retryAfter > 0) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      setEmailError(true);
      setAvailabilityError("");
      showToast("Enter a valid email address", "error");
      return;
    }

    setEmailError(false);
    setEmailExists(false);
    setAvailabilityError("");
    setCheckingEmail(true);

    try {
      const result = await checkSignupEmail(normalizedEmail);
      if (!result.available) {
        setEmailExists(true);
        return;
      }
      onNext(normalizedEmail);
    } catch (error) {
      if (error?.code === "rate_limited") {
        const waitSeconds = Math.max(1, Number(error.retryAfterSeconds) || 60);
        setRetryAfter(waitSeconds);
        setAvailabilityError(`Too many email checks. Please wait ${waitSeconds} seconds and try again.`);
        return;
      }

      if (error?.code === "invalid_email" || error?.code === "invalid_request") {
        setEmailError(true);
        setAvailabilityError("");
        return;
      }

      // This check is a helpful early warning, not the final uniqueness guard.
      // If the Edge Function is temporarily unavailable, allow the user to
      // continue; Supabase signUp still handles duplicate addresses at Step 4.
      console.error("Signup email availability check failed:", error);
      showToast("We couldn't check that email right now. We'll check again when creating your account.");
      onNext(normalizedEmail);
    } finally {
      setCheckingEmail(false);
    }
  }

  return (
    <form className="screen-enter" onSubmit={handleContinue} noValidate>
      <BackButton onClick={onBack} />

      <div className="eyebrow">STEP 2 OF 4</div>
      <h2 className="display">What's your email?</h2>
      <p className="subtitle">
        Use an email you can access. We'll send your verification code at the end.
      </p>

      <div className={`field ${emailError || emailExists ? "has-error" : ""}`}>
        <label htmlFor="signup-email">Email address</label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError(false);
            setEmailExists(false);
            setAvailabilityError("");
          }}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={emailError || emailExists}
          aria-describedby={emailError || emailExists || availabilityError ? "signup-email-feedback" : undefined}
        />
        <div className="error">
          {emailExists ? (
            <span id="signup-email-feedback">
              Email already exists — try <Link to="/login">logging in instead</Link>.
            </span>
          ) : emailError ? (
            <span id="signup-email-feedback">Enter a valid email address.</span>
          ) : null}
        </div>
        {!emailExists && availabilityError && (
          <p className="signup-email-feedback" id="signup-email-feedback" role="alert">
            {availabilityError}
          </p>
        )}
      </div>

      <div className="spacer" />

      <button
        type="submit"
        className={`btn btn-primary ${!EMAIL_RE.test(email.trim()) || checkingEmail || retryAfter > 0 ? "is-invalid" : ""}`}
        disabled={checkingEmail || retryAfter > 0}
      >
        {checkingEmail ? "Checking email…" : retryAfter > 0 ? `Wait ${retryAfter}s` : "Continue"}
      </button>
    </form>
  );
}
