import { useEffect, useRef, useState } from "react";
import BackButton from "../common/BackButton";
<<<<<<< HEAD
import { signUp, verifySignupOtp, resendSignupOtp, getUser } from "../../services/supabase/auth";
=======
import {
  signUp,
  signOut,
  verifySignupOtp,
  resendSignupOtp,
  getUser,
} from "../../services/supabase/auth";
>>>>>>> 1322a16 (update)
import { createProfile } from "../../services/supabase/profiles";
import { uploadToStorage } from "../../services/supabase/storage";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";

export default function EmailVerificationFinal({
  username,
  password,
  email,
  profileData,
<<<<<<< HEAD
  onComplete,
  onBack,
}) {
  const [showOtp, setShowOtp] = useState(false);
=======
  initialShowOtp = false,
  onVerificationStarted,
  onComplete,
  onBack,
}) {
  const [showOtp, setShowOtp] = useState(initialShowOtp);
>>>>>>> 1322a16 (update)
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
<<<<<<< HEAD
=======

>>>>>>> 1322a16 (update)
  const inputRefs = useRef([]);
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  useEffect(() => {
<<<<<<< HEAD
    if (cooldown <= 0) return;
=======
    if (initialShowOtp) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [initialShowOtp]);

  useEffect(() => {
    if (cooldown <= 0) return;

>>>>>>> 1322a16 (update)
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSendCode() {
    if (sending) return;
<<<<<<< HEAD
    setSending(true);
    try {
      await runWithLoader("Creating your account…", async () => {
        const { error } = await signUp({ email, password, username });
        if (error) throw error;
      });
      setShowOtp(true);
      setCooldown(30);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      showToast((err && err.message) || "Couldn't create account — try again", "error");
=======

    setSending(true);

    try {
      if (!username || !password || !email) {
        throw new Error("Your account information is incomplete");
      }

      if (
        !profileData?.name ||
        !profileData?.faculty ||
        !profileData?.department ||
        !profileData?.level
      ) {
        throw new Error("Your profile information is incomplete");
      }

      let signupResult;

      await runWithLoader("Creating your account…", async () => {
        signupResult = await signUp({ email, password, username });

        if (signupResult.error) {
          throw signupResult.error;
        }
      });

      const { data } = signupResult;

      // Email confirmation must remain enabled. If Supabase returns a
      // session immediately, the project is allowing unverified access.
      // Sign that session out and stop here rather than allowing the user
      // into Campus Connect without completing verification.
      if (data?.session) {
        await signOut();
        throw new Error(
          "Email verification is required before entering Campus Connect"
        );
      }

      // Supabase can return an existing user without an error in some
      // configurations. Do not pretend that this is a fresh signup.
      if (!data?.user) {
        throw new Error("Couldn't create your account — please try again");
      }

      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error(
          "An account with that email already exists — try logging in instead"
        );
      }

      setShowOtp(true);
      setCooldown(30);
      onVerificationStarted?.();
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      console.error("Signup verification email failed:", err);
      showToast(
        err?.message || "Couldn't create account — try again",
        "error"
      );
>>>>>>> 1322a16 (update)
    } finally {
      setSending(false);
    }
  }

  function updateDigit(i, raw) {
    const value = raw.replace(/[^0-9]/g, "").slice(-1);
    const next = [...digits];
    next[i] = value;
    setDigits(next);
<<<<<<< HEAD
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
      let profileRow;
      await runWithLoader("Finishing your account…", async () => {
        const { error: verifyError } = await verifySignupOtp({ email, token: code });
        if (verifyError) throw verifyError;

        const { data: userData, error: userError } = await getUser();
        if (userError || !userData.user) {
          throw userError || new Error("No signed-in user found after verification");
=======

    if (value && i < 5) {
      inputRefs.current[i + 1]?.focus();
    }

    const code = next.join("");
    if (code.length === 6 && !checking) {
      verifyCode(code);
    }
  }

  function handleKeyDown(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/[^0-9]/g, "")
      .slice(0, 6);

    if (!pasted) return;

    e.preventDefault();

    const next = pasted.split("");
    while (next.length < 6) next.push("");

    setDigits(next);

    if (pasted.length === 6) {
      verifyCode(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  }

  async function verifyCode(code) {
    if (checking) return;

    setOtpError("");
    setChecking(true);

    try {
      let profileRow;

      await runWithLoader("Finishing your account…", async () => {
        const { error: verifyError } = await verifySignupOtp({
          email,
          token: code,
        });

        if (verifyError) throw verifyError;

        const { data: userData, error: userError } = await getUser();

        if (userError || !userData?.user) {
          throw (
            userError ||
            new Error("No signed-in user found after verification")
          );
>>>>>>> 1322a16 (update)
        }

        const userId = userData.user.id;
        let avatarUrl = "";
<<<<<<< HEAD
        if (profileData && profileData.avatarFile) {
          avatarUrl = await uploadToStorage("avatars", profileData.avatarFile, userId);
=======

        if (profileData.avatarFile) {
          avatarUrl = await uploadToStorage(
            "avatars",
            profileData.avatarFile,
            userId
          );
>>>>>>> 1322a16 (update)
        }

        profileRow = {
          id: userId,
          username,
          name: profileData.name,
          faculty: profileData.faculty,
          department: profileData.department,
          level: profileData.level,
          avatar_url: avatarUrl || null,
        };

        await createProfile(profileRow);
      });

      showToast("Account created successfully!");
      onComplete(profileRow);
    } catch (err) {
<<<<<<< HEAD
      const msg = err && err.message && err.message.includes("duplicate")
        ? "That username was just taken — go back and pick another"
        : (err && err.message) || "Couldn't verify — check the code and try again";
=======
      const msg =
        err?.message?.includes("duplicate") ||
        err?.code === "23505"
          ? "That username was just taken — go back and pick another"
          : err?.message || "Couldn't verify — check the code and try again";

>>>>>>> 1322a16 (update)
      setOtpError(msg);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setChecking(false);
    }
  }

  async function handleResend() {
<<<<<<< HEAD
    setDigits(["", "", "", "", "", ""]);
    inputRefs.current[0]?.focus();
    const { error } = await resendSignupOtp(email);
    if (error) { showToast(error.message || "Couldn't resend — try again shortly", "error"); return; }
=======
    if (cooldown > 0 || checking) return;

    setDigits(["", "", "", "", "", ""]);
    setOtpError("");
    inputRefs.current[0]?.focus();

    const { error } = await resendSignupOtp(email);

    if (error) {
      showToast(
        error.message || "Couldn't resend — try again shortly",
        "error"
      );
      return;
    }

>>>>>>> 1322a16 (update)
    showToast(`New code sent to ${email}`);
    setCooldown(30);
  }

  return (
    <div className="screen-enter">
<<<<<<< HEAD
      <BackButton onClick={() => (showOtp ? setShowOtp(false) : onBack())} />
      <div className="eyebrow">STEP 4 OF 4</div>
      <h2 className="display">Verify your email</h2>
      <p className="subtitle">We'll send a 6-digit code to confirm it's you.</p>

      {!showOtp ? (
        <>
          <p className="subtitle" style={{ marginTop: -16, marginBottom: 24 }}>A verification code will be sent to <strong>{email}</strong></p>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={handleSendCode} disabled={sending}>
=======
      <BackButton
        onClick={() => (showOtp ? setShowOtp(false) : onBack())}
      />

      <div className="eyebrow">STEP 4 OF 4</div>
      <h2 className="display">Verify your email</h2>
      <p className="subtitle">
        We'll send a 6-digit code to confirm it's you.
      </p>

      {!showOtp ? (
        <>
          <p
            className="subtitle"
            style={{ marginTop: -16, marginBottom: 24 }}
          >
            A verification code will be sent to{" "}
            <strong>{email}</strong>
          </p>

          <div className="spacer" />

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSendCode}
            disabled={sending}
          >
>>>>>>> 1322a16 (update)
            Send code to {email}
          </button>
        </>
      ) : (
        <>
<<<<<<< HEAD
          <p className="subtitle" style={{ marginTop: -16 }}>Enter the 6-digit code we sent to {email}.</p>
          <div className="field">
            <label>Enter the 6-digit code</label>
=======
          <p className="subtitle" style={{ marginTop: -16 }}>
            Enter the 6-digit code we sent to {email}.
          </p>

          <div className="field">
            <label>Enter the 6-digit code</label>

>>>>>>> 1322a16 (update)
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
<<<<<<< HEAD
            {otpError && <div className="error" style={{ display: "block" }}>{otpError}</div>}
          </div>
          <button type="button" className="btn btn-ghost" disabled={cooldown > 0} onClick={handleResend}>
            Resend code {cooldown > 0 ? `(${cooldown}s)` : ""}
          </button>
=======

            {otpError && (
              <div className="error" style={{ display: "block" }}>
                {otpError}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            disabled={cooldown > 0 || checking}
            onClick={handleResend}
          >
            Resend code {cooldown > 0 ? `(${cooldown}s)` : ""}
          </button>

>>>>>>> 1322a16 (update)
          <div className="spacer" />
        </>
      )}
    </div>
  );
}
