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
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  const usernameValid = USERNAME_RE.test(username);
  const passwordValid = isPasswordValid(password);
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;

  async function handleContinue() {
    if (submitting) return;
<<<<<<< HEAD
    const missing = [];
    if (!usernameValid) missing.push("a valid username");
    if (!passwordValid) missing.push("the password requirements");
    if (!confirmValid) { missing.push("matching passwords"); setConfirmError(true); }
=======

    const missing = [];
    if (!usernameValid) missing.push("a valid username");
    if (!passwordValid) missing.push("the password requirements");
    if (!confirmValid) {
      missing.push("matching passwords");
      setConfirmError(true);
    }

>>>>>>> 1322a16 (update)
    if (missing.length > 0) {
      showToast(`Finish ${joinList(missing)} to continue`, "error");
      return;
    }

    setSubmitting(true);
<<<<<<< HEAD
    try {
      let available = true;
      await runWithLoader("Checking username…", async () => {
        available = await checkUsernameAvailable(username);
      });
=======

    try {
      let available = true;

      await runWithLoader("Checking username…", async () => {
        available = await checkUsernameAvailable(username);
      });

>>>>>>> 1322a16 (update)
      if (!available) {
        setUsernameTaken(true);
        return;
      }
<<<<<<< HEAD
      onNext(username, password);
    } catch (err) {
      console.error("Username check failed:", err);
      showToast("Couldn't check that username — check your connection and try again", "error");
=======

      onNext(username, password);
    } catch (err) {
      console.error("Username check failed:", err);
      showToast(
        "Couldn't check that username — check your connection and try again",
        "error"
      );
>>>>>>> 1322a16 (update)
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen-enter">
      <BackButton onClick={onBack} />
<<<<<<< HEAD
      <div className="eyebrow">STEP 1 OF 3</div>
      <h2 className="display">Create your account</h2>
      <p className="subtitle">Pick a username and password — you'll verify your email next.</p>

      <UsernameField
        value={username}
        onChange={(v) => { setUsername(v); setUsernameTaken(false); }}
        hintText={usernameTaken ? "That username is already taken — try another" : undefined}
        hintState={usernameTaken ? "taken" : usernameValid ? "ok" : "default"}
        error={usernameTaken}
      />
      <PasswordField label="Password" value={password} onChange={setPassword} placeholder="Create a password" />
=======

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
        label="Password"
        value={password}
        onChange={setPassword}
        placeholder="Create a password"
      />

>>>>>>> 1322a16 (update)
      <div className={`field ${confirmError && !confirmValid ? "has-error" : ""}`}>
        <label>Confirm password</label>
        <input
          type="password"
          value={confirmPassword}
<<<<<<< HEAD
          onChange={(e) => { setConfirmPassword(e.target.value); setConfirmError(false); }}
=======
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setConfirmError(false);
          }}
>>>>>>> 1322a16 (update)
          placeholder="Re-enter your password"
        />
        <div className="error">Passwords don't match</div>
      </div>

      <div className="spacer" />
<<<<<<< HEAD
      <button type="button" className={`btn btn-primary ${!(usernameValid && passwordValid && confirmValid) ? "is-invalid" : ""}`} onClick={handleContinue}>
        Continue
      </button>
      <p className="link-row">Already have an account? <Link to="/login">Log in instead</Link></p>
=======

      <button
        type="button"
        className={`btn btn-primary ${
          !(usernameValid && passwordValid && confirmValid) ? "is-invalid" : ""
        }`}
        onClick={handleContinue}
      >
        Continue
      </button>

      <p className="link-row">
        Already have an account? <Link to="/login">Log in instead</Link>
      </p>
>>>>>>> 1322a16 (update)
    </div>
  );
}
