import { useState } from "react";
import PasswordField from "../common/PasswordField";
import { signOut, updatePassword } from "../../services/supabase/auth";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { isPasswordValid } from "../../utils/validation";

// Rendered by AppRoutes while AuthContext is in PASSWORD_RECOVERY.
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

  async function handleSubmit(event) {
    event.preventDefault();
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

        // Once Supabase accepts the password change, release the recovery
        // guard and resolve the current session before attempting optional
        // cleanup. A failure revoking other sessions must not strand this tab
        // in PASSWORD_RECOVERY after the password has already changed.
        await completeRecovery();

        const { error: otherSessionsError } = await signOut({ scope: "others" });
        if (otherSessionsError) {
          console.warn("Password updated, but other sessions could not be revoked:", otherSessionsError);
        }
      });
      showToast("Password updated — you're logged in");
    } catch (err) {
      console.error("Password reset failed:", err);
      showToast((err && err.message) || "Couldn't set your new password — request a new reset code and try again", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="screen-enter" onSubmit={handleSubmit}>
      <div className="eyebrow">PASSWORD RESET</div>
      <h2 className="display">Choose a new password</h2>
      <p className="subtitle">This resets the password for your account.</p>

      <PasswordField
        id="reset-password"
        label="New password"
        value={password}
        onChange={setPassword}
        placeholder="Create a new password"
        autoComplete="new-password"
      />
      <div className={`field ${confirmError && !confirmValid ? "has-error" : ""}`}>
        <label htmlFor="reset-confirm-password">Confirm new password</label>
        <input
          id="reset-confirm-password"
          type="password"
          value={confirm}
          onChange={(event) => { setConfirm(event.target.value); setConfirmError(false); }}
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          aria-invalid={confirmError && !confirmValid}
        />
        <div className="error">Passwords don't match</div>
      </div>

      <div className="spacer" />
      <button type="submit" className={`btn btn-primary ${!(passwordValid && confirmValid) ? "is-invalid" : ""}`} disabled={submitting}>
        {submitting ? "Updating password…" : "Set new password"}
      </button>
    </form>
  );
}
