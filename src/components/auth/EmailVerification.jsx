import { useState } from "react";
import BackButton from "../common/BackButton";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE } from "../../utils/validation";

<<<<<<< HEAD
export default function EmailVerification({ onNext, onBack }) {
  const [email, setEmail] = useState("");
=======
export default function EmailVerification({
  initialEmail,
  onNext,
  onBack,
}) {
  const [email, setEmail] = useState(initialEmail || "");
>>>>>>> 1322a16 (update)
  const [emailError, setEmailError] = useState(false);
  const { showToast } = useToast();

  function handleContinue() {
    if (!EMAIL_RE.test(email)) {
      setEmailError(true);
      showToast("Enter a valid email address", "error");
      return;
    }
<<<<<<< HEAD
=======

>>>>>>> 1322a16 (update)
    onNext(email);
  }

  return (
    <div className="screen-enter">
      <BackButton onClick={onBack} />
<<<<<<< HEAD
      <div className="eyebrow">STEP 2 OF 4</div>
      <h2 className="display">What's your email?</h2>
      <p className="subtitle">We'll send you a verification code at the end.</p>
=======

      <div className="eyebrow">STEP 2 OF 4</div>
      <h2 className="display">What's your email?</h2>
      <p className="subtitle">
        We'll send you a verification code at the end.
      </p>
>>>>>>> 1322a16 (update)

      <div className={`field ${emailError ? "has-error" : ""}`}>
        <label>Email address</label>
        <input
          type="email"
          value={email}
<<<<<<< HEAD
          onChange={(e) => { setEmail(e.target.value); setEmailError(false); }}
=======
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(false);
          }}
>>>>>>> 1322a16 (update)
          placeholder="you@example.com"
          autoComplete="email"
        />
        <div className="error">Enter a valid email address</div>
      </div>

      <div className="spacer" />
<<<<<<< HEAD
      <button type="button" className={`btn btn-primary ${!EMAIL_RE.test(email) ? "is-invalid" : ""}`} onClick={handleContinue}>
=======

      <button
        type="button"
        className={`btn btn-primary ${
          !EMAIL_RE.test(email) ? "is-invalid" : ""
        }`}
        onClick={handleContinue}
      >
>>>>>>> 1322a16 (update)
        Continue
      </button>
    </div>
  );
}
