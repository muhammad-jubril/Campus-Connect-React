import { useId, useState } from "react";
import { checkPasswordRules } from "../../utils/validation";

// Reusable password input: show/hide toggle + the live requirements
// checklist. Used on Signup Step 1 and Reset Password — identical rules
// in both places (ported from checkPasswordRules in the vanilla build).
export default function PasswordField({ label, value, onChange, placeholder, showRequirements = true, error, id }) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const fieldId = id || autoId;
  const rules = checkPasswordRules(value);

  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      {label && <label htmlFor={fieldId}>{label}</label>}
      <div className="pw-wrap">
        <input
          id={fieldId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
        />
        <button
          type="button"
          className={`pw-toggle ${visible ? "active" : ""}`}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12 5c-5.5 0-9.3 4-11 7 1.7 3 5.5 7 11 7s9.3-4 11-7c-1.7-3-5.5-7-11-7zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
          </svg>
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {showRequirements && (
        <ul className="pw-requirements">
          <li className={rules.length ? "met" : ""}><span className="rule-dot" />At least 8 characters</li>
          <li className={rules.lower ? "met" : ""}><span className="rule-dot" />One lowercase letter</li>
          <li className={rules.upper ? "met" : ""}><span className="rule-dot" />One uppercase letter</li>
          <li className={rules.number ? "met" : ""}><span className="rule-dot" />One number</li>
        </ul>
      )}
    </div>
  );
}
