import { useState } from "react";
import BackButton from "../common/BackButton";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE } from "../../utils/validation";

export default function EmailVerification({
  initialEmail,
  onNext,
  onBack,
}) {
  const [email, setEmail] = useState(initialEmail || "");
  const [emailError, setEmailError] = useState(false);
  const { showToast } = useToast();

  function handleContinue(event) {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!EMAIL_RE.test(normalizedEmail)) {
      setEmailError(true);
      showToast("Enter a valid email address", "error");
      return;
    }

    onNext(normalizedEmail);
  }

  return (
    <form className="screen-enter" onSubmit={handleContinue} noValidate>
      <BackButton onClick={onBack} />

      <div className="eyebrow">STEP 2 OF 4</div>
      <h2 className="display">What's your email?</h2>
      <p className="subtitle">
        We'll send you a verification code at the end.
      </p>

      <div className={`field ${emailError ? "has-error" : ""}`}>
        <label htmlFor="signup-email">Email address</label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(false);
          }}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={emailError}
        />
        <div className="error">Enter a valid email address</div>
      </div>

      <div className="spacer" />

      <button
        type="submit"
        className={`btn btn-primary ${!EMAIL_RE.test(email.trim()) ? "is-invalid" : ""}`}
      >
        Continue
      </button>
    </form>
  );
}
