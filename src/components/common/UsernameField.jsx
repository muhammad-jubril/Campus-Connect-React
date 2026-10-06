import { USERNAME_RE } from "../../utils/validation";

// Presentational only — the parent owns the value and any async
// availability check (e.g. Signup Step 1's live "is this taken?" RPC).
// `hintText`/`hintState` let the parent show format guidance, a live
// "checking…", or "That username is already taken".
export default function UsernameField({ value, onChange, hintText, hintState = "default", error }) {
  const valid = USERNAME_RE.test(value);
  return (
    <div className="field">
      <label>Username</label>
      <div className={`username-field ${valid ? "valid" : ""} ${error ? "has-error" : ""}`}>
        <input
          type="text"
          value={value}
          maxLength={16}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16))}
          placeholder="e.g. aisha_bello"
        />
        <svg className="username-check" viewBox="0 0 24 24" width="18" height="18">
          <path fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </div>
      <div className={`username-hint ${hintState === "taken" ? "taken" : ""} ${hintState === "ok" ? "ok" : ""}`}>
        {hintText || "6–16 characters: letters, numbers, underscores"}
      </div>
    </div>
  );
}
