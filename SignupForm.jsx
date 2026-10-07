import { useState } from "react";
import { Link } from "react-router-dom";
import UsernameField from "../common/UsernameField";
import PasswordField from "../common/PasswordField";
import BackButton from "../common/BackButton";
import { checkUsernameAvailable } from "../../services/supabase/profiles";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { USERNAME_RE, isPasswordValid, joinList } from "../../utils/validation";

export default function SignupForm({ initialUsername, initialPassword, onNext, onBack }) {
  const [username, setUsername] = useState(initialUsername || "");
  const [password, setPassword] = useState(initialPassword || "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  const usernameValid = USERNAME_RE.test(username);
  const passwordValid = isPasswordValid(password);
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;

  async function handleContinue(event) {
    event.preventDefault();
    if (submitting) return;

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

    if (!termsAccepted) {
      setTermsError(true);
      showToast("Agree to the Terms and Privacy Policy to continue", "error");
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

      onNext(username, password);
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
    <form className="screen-enter" onSubmit={handleContinue}>
      <BackButton onClick={onBack} />

      <div className="eyebrow">STEP 1 OF 4</div>
      <h2 className="display">Create your account</h2>
      <p className="subtitle">
        Pick a username and password — you'll add your email next.
      </p>

      <UsernameField
        value={username}
        onChange={(v) => {
          setUsername(v);
          setUsernameTaken(false);
        }}
        hintText={
          usernameTaken
            ? "That username is already taken — try another"
            : undefined
        }
        hintState={usernameTaken ? "taken" : usernameValid ? "ok" : "default"}
        error={usernameTaken}
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
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setConfirmError(false);
          }}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          aria-invalid={confirmError && !confirmValid}
        />
        <div className="error">Passwords don't match</div>
      </div>

      <div
        className="field"
        style={{ marginTop: 2, marginBottom: 8 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "10px 2px",
          }}
        >
          <input
            id="signup-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => {
              setTermsAccepted(e.target.checked);
              setTermsError(false);
            }}
            aria-invalid={termsError}
            aria-required="true"
            style={{ marginTop: 3, flex: "0 0 auto" }}
          />
          <label
            htmlFor="signup-terms"
            style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 400 }}
          >
            I agree to the <Link to="/terms">Terms</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link>.
          </label>
        </div>
        {termsError && (
          <div className="error" style={{ display: "block" }}>
            You must agree before creating an account.
          </div>
        )}
      </div>

      <div className="spacer" />

      <button
        type="submit"
        className={`btn btn-primary ${
          !(usernameValid && passwordValid && confirmValid && termsAccepted) ? "is-invalid" : ""
        }`}
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
