import { useEffect, useRef, useState } from "react";
import BackButton from "../common/BackButton";
import { signUp, verifySignupOtp, resendSignupOtp } from "../../services/supabase/auth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { EMAIL_RE } from "../../utils/validation";

export default function EmailVerification({ username, password, onNext, onBack }) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const inputRefs = useRef([]);
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSendCode() {
    if (sending) return;
    if (!EMAIL_RE.test(email)) {
      setEmailError(true);
      return;
    }
    setSending(true);
    try {
      await runWithLoader("Sending your verification code…", async () => {
        const { error } = await signUp({ email, password, username });
        if (error) throw error;
      });
      setShowOtp(true);
      setCooldown(30);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setEmailError(true);
      showToast((err && err.message) || "Couldn't send the code — try again", "error");
    } finally {
      setSending(false);
    }
  }

  function updateDigit(i, raw) {
    const value = raw.replace(/[^0-9]/g, "").slice(-1);
    const next = [...digits];
    next[i] = value;
    setDigits(next);
    if (value && i < 5) inputRefs.current[i + 1]?.focus();
    const code = next.join("");
    if (code.length === 6) verifyCode(code);
  }

  function handleKeyDown(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputRefs.current[i - 1]?.focus();
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.split("");
    while (next.length < 6) next.push("");
    setDigits(next);
    if (pasted.length === 6) verifyCode(pasted);
    else inputRefs.current[pasted.length]?.focus();
  }

  async function verifyCode(code) {
    setOtpError("");
    setChecking(true);
    try {
      await runWithLoader("Verifying your code…", async () => {
        const { error } = await verifySignupOtp({ email, token: code });
        if (error) throw error;
      });
      showToast("Email verified");
      onNext(email);
    } catch (err) {
      setOtpError((err && err.message) || "That code didn't work — check it and try again");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setChecking(false);
    }
  }

  async function handleResend() {
    setDigits(["", "", "", "", "", ""]);
    inputRefs.current[0]?.focus();
    const { error } = await resendSignupOtp(email);
    if (error) { showToast(error.message || "Couldn't resend — try again shortly", "error"); return; }
    showToast(`New code sent to ${email}`);
    setCooldown(30);
  }

  return (
    <div className="screen-enter">
      <BackButton onClick={() => (showOtp ? setShowOtp(false) : onBack())} />
      <div className="eyebrow">STEP 2 OF 3</div>
      <h2 className="display">Verify your email</h2>
      <p className="subtitle">{showOtp ? `We'll send a 6-digit code to confirm it's you.` : `We'll send a 6-digit code to confirm it's you.`}</p>

      {!showOtp ? (
        <>
          <div className={`field ${emailError ? "has-error" : ""}`}>
            <label>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(false); }}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <div className="error">Enter a valid email address</div>
          </div>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={handleSendCode}>Send code</button>
        </>
      ) : (
        <>
          <p className="subtitle" style={{ marginTop: -16 }}>Enter the code we sent to {email}.</p>
          <div className="field">
            <label>Enter the 6-digit code</label>
            <div className={`otp-row ${checking ? "checking" : ""}`}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  maxLength={1}
                  inputMode="numeric"
                  className="otp-digit"
                  value={d}
                  disabled={checking}
                  onChange={(e) => updateDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                />
              ))}
            </div>
            {otpError && <div className="error" style={{ display: "block" }}>{otpError}</div>}
          </div>
          <button type="button" className="btn btn-ghost" disabled={cooldown > 0} onClick={handleResend}>
            Resend code {cooldown > 0 ? `(${cooldown}s)` : ""}
          </button>
          <div className="spacer" />
        </>
      )}
    </div>
  );
}
