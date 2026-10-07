import { useState } from "react";
import PasswordField from "../common/PasswordField";
import { signOut, updatePassword } from "../../services/supabase/auth";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { isPasswordValid } from "../../utils/validation";

// Rendered by AppRoutes whenever AuthContext.status === PASSWORD_RECOVERY —
// this is a deep link from an email, so it overrides whatever route was
// actually requested, same as the vanilla build's handling of this event.
export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { completeRecovery } = useAuth();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  const passwordValid = isPasswordValid(password);
  const confirmValid = confirm.length > 0 && confirm === password;

  async function handleSubmit() {
    if (submitting) return;
    if (!passwordValid || !confirmValid) {
      if (!confirmValid) setConfirmError(true);
      showToast("Finish the password requirements to continue", "error");
      return;
    }
    setSubmitting(true);
    try {
      await runWithLoader("Setting your new password…", async () => {
        const { error } = await updatePassword(password);
        if (error) throw error;

        // The recovery session stays active, while every other session is
        // revoked so a previously stolen session cannot remain usable.
        const { error: otherSessionsError } = await signOut({ scope: "others" });
        if (otherSessionsError) throw otherSessionsError;

        await completeRecovery();
      });
      showToast("Password updated — you're logged in");
    } catch (err) {
      console.error("Password reset failed:", err);
      showToast((err && err.message) || "Couldn't set your new password — try the reset link again", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen-enter">
      <h2 className="display">Choose a new password</h2>
      <p className="subtitle">This resets the password for your account.</p>

      <PasswordField label="New password" value={password} onChange={setPassword} placeholder="Create a new password" />
      <div className={`field ${confirmError && !confirmValid ? "has-error" : ""}`}>
        <label>Confirm new password</label>
        <input type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setConfirmError(false); }} placeholder="Re-enter your new password" />
        <div className="error">Passwords don't match</div>
      </div>

      <div className="spacer" />
      <button type="button" className={`btn btn-primary ${!(passwordValid && confirmValid) ? "is-invalid" : ""}`} onClick={handleSubmit}>
        Set new password
      </button>
    </div>
  );
}
