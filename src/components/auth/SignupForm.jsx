import { useState } from "react";
import { Link } from "react-router-dom";
import UsernameField from "../common/UsernameField";
import PasswordField from "../common/PasswordField";
import BackButton from "../common/BackButton";
import { checkUsernameAvailable } from "../../services/supabase/profiles";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { isReservedUsername, USERNAME_RE, isPasswordValid, joinList } from "../../utils/validation";

const RESERVED_USERNAME_MESSAGE = "That username isn't available";

export default function SignupForm({
  initialUsername,
  initialPassword,
  initialTermsAccepted = false,
  onNext,
  onBack,
}) {
  const [username, setUsername] = useState(initialUsername || "");
  const [password, setPassword] = useState(initialPassword || "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(initialTermsAccepted);
  const [termsError, setTermsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  const usernameReserved = isReservedUsername(username);
  const usernameValid = USERNAME_RE.test(username) && !usernameReserved;
  const passwordValid = isPasswordValid(password);
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;

  async function handleContinue(event) {
    event.preventDefault();
    if (submitting) return;

    if (usernameReserved) {
      showToast(RESERVED_USERNAME_MESSAGE, "error");
      return;
    }

    if (!termsAccepted) {
      setTermsError(true);
      showToast("Agree to the Terms of Use and Privacy Policy to continue", "error");
      return;
    }

    const missing = [];
    if (!usernameValid) missing.push("a valid username");
    if (!passwordValid) missing.push("the password requirements");
    if (!confirmValid) {
      missing.push("matching passwords");
      setConfirmError(true);
    }

    if (missing.length > 0) {
      showToast(`Finish ${joinList(missing)} to continue`, "error");
      return;
    }

    setSubmitting(true);

    try {
      let available = true;

      await runWithLoader("Checking username…", async () => {
        available = await checkUsernameAvailable(username);
      });

      if (!available) {
        setUsernameTaken(true);
        return;
      }

      onNext(username, password, termsAccepted);
    } catch (err) {
      console.error("Username check failed:", err);
      showToast(
        "Couldn't check that username — check your connection and try again",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="screen-enter" onSubmit={handleContinue} noValidate>
      <BackButton onClick={onBack} />

      <div className="eyebrow">STEP 1 OF 4</div>
      <h2 className="display">Create your account</h2>
      <p className="subtitle">
        Pick a username and password — you'll add your email next.
      </p>

      <UsernameField
        value={username}
        onChange={(value) => {
          setUsername(value);
          setUsernameTaken(false);
        }}
        hintText={
          usernameTaken
            ? "That username is already taken — try another"
            : undefined
        }
        hintState={usernameTaken ? "taken" : usernameValid ? "ok" : "default"}
        error={usernameTaken || usernameReserved}
      />

      <PasswordField
        id="signup-password"
        label="Password"
        value={password}
        onChange={setPassword}
        placeholder="Create a password"
        autoComplete="new-password"
      />

      <div className={`field ${confirmError && !confirmValid ? "has-error" : ""}`}>
        <label htmlFor="signup-confirm-password">Confirm password</label>
        <input
          id="signup-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setConfirmError(false);
          }}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          aria-invalid={confirmError && !confirmValid}
        />
        <div className="error">Passwords don't match</div>
      </div>

      <div className={`signup-consent ${termsError && !termsAccepted ? "has-error" : ""}`}>
        <input
          id="signup-legal-consent"
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => {
            setTermsAccepted(event.target.checked);
            setTermsError(false);
          }}
          aria-invalid={termsError && !termsAccepted}
          aria-describedby={termsError && !termsAccepted ? "signup-legal-error" : undefined}
          required
        />
        <div className="signup-consent-copy">
          <label htmlFor="signup-legal-consent">
            I agree to the Terms of Use and Privacy Policy.
          </label>
          <div className="signup-consent-links">
            <Link to="/terms" target="_blank" rel="noreferrer">Read Terms</Link>
            <Link to="/privacy" target="_blank" rel="noreferrer">Read Privacy Policy</Link>
          </div>
          {termsError && !termsAccepted && (
            <p id="signup-legal-error" className="signup-consent-error" role="alert">
              You must accept both policies to create an account.
            </p>
          )}
        </div>
      </div>

      <div className="spacer" />

      <button
        type="submit"
        className={`btn btn-primary ${!(usernameValid && passwordValid && confirmValid && termsAccepted) ? "is-invalid" : ""}`}
        disabled={submitting}
      >
        Continue
      </button>

      <p className="link-row">
        Already have an account? <Link to="/login">Log in instead</Link>
      </p>
    </form>
  );
}
