import { useId } from "react";
import { isReservedUsername, USERNAME_RE } from "../../utils/validation";

// Presentational only — the parent owns the value and any async
// availability check (e.g. Signup Step 1's live "is this taken?" RPC).
// `hintText`/`hintState` let the parent show format guidance, a live
// "checking…", or "That username is already taken".
export default function UsernameField({ value, onChange, hintText, hintState = "default", error, id }) {
  const validFormat = USERNAME_RE.test(value);
  const reserved = isReservedUsername(value);
  const valid = validFormat && !reserved;
  const showError = !!error || reserved;
  const autoId = useId();
  const fieldId = id || autoId;
  const hintId = `${fieldId}-hint`;
  const resolvedHintText = reserved ? "That username isn't available" : hintText;
  const resolvedHintState = reserved || hintState === "taken" ? "taken" : hintState;

  return (
    <div className="field">
      <label htmlFor={fieldId}>Username</label>
      <div className={`username-field ${valid ? "valid" : ""} ${showError ? "has-error" : ""}`}>
        <input
          id={fieldId}
          type="text"
          value={value}
          maxLength={16}
          autoComplete="username"
          onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16))}
          placeholder="e.g. aisha_bello"
          aria-invalid={showError}
          aria-describedby={hintId}
        />
        <svg className="username-check" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </div>
      <div id={hintId} className={`username-hint ${resolvedHintState === "taken" ? "taken" : ""} ${resolvedHintState === "ok" ? "ok" : ""}`}>
        {resolvedHintText || "6–16 characters: letters, numbers, underscores"}
      </div>
    </div>
  );
}
