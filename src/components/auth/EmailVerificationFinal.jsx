import { useEffect, useRef, useState } from "react";
import BackButton from "../common/BackButton";
import {
  signUp,
  signOut,
  verifySignupOtp,
  resendSignupOtp,
  getUser,
} from "../../services/supabase/auth";
import { createProfile, updateProfile } from "../../services/supabase/profiles";
import { uploadToStorage, removeUploadedFile } from "../../services/supabase/storage";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { TERMS_VERSION, PRIVACY_VERSION } from "../../utils/legalVersions";

export default function EmailVerificationFinal({
  username,
  password,
  email,
  profileData,
  termsAccepted = false,
  initialShowOtp = false,
  onVerificationStarted,
  onComplete,
  onBack,
}) {
  const [showOtp, setShowOtp] = useState(initialShowOtp);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  const inputRefs = useRef([]);
  const { refreshAuth } = useAuth();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  useEffect(() => {
    if (initialShowOtp) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [initialShowOtp]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSendCode() {
    if (sending) return;
    setSending(true);

    try {
      if (!username || !password || !email) {
        throw new Error("Your account information is incomplete");
      }
      if (!termsAccepted) {
        throw new Error("Accept the Terms of Use and Privacy Policy before creating your account");
      }
      if (!profileData?.name || !profileData?.faculty || !profileData?.department || !profileData?.level) {
        throw new Error("Your profile information is incomplete");
      }

      let signupResult;
      await runWithLoader("Creating your account…", async () => {
        signupResult = await signUp({ email, password, username });
        if (signupResult.error) throw signupResult.error;
      });

      const { data } = signupResult;
      if (data?.session) {
        await signOut();
        throw new Error("Email verification is required before entering Campus Connect");
      }
      if (!data?.user) {
        throw new Error("Couldn't create your account — please try again");
      }
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error("An account with that email already exists — try logging in instead");
      }

      setShowOtp(true);
      setCooldown(30);
      onVerificationStarted?.();
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (error) {
      console.error("Signup verification email failed:", error);
      showToast(error?.message || "Couldn't create account — try again", "error");
    } finally {
      setSending(false);
    }
  }

  function updateDigit(index, raw) {
    const value = raw.replace(/[^0-9]/g, "").slice(-1);
    const next = [...digits];
    next[index] = value;
    setDigits(next);

    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    const code = next.join("");
    if (code.length === 6 && !checking) verifyCode(code);
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    const next = pasted.split("");
    while (next.length < 6) next.push("");
    setDigits(next);
    if (pasted.length === 6) verifyCode(pasted);
    else inputRefs.current[pasted.length]?.focus();
  }

  async function verifyCode(code) {
    if (checking) return;
    setOtpError("");
    setChecking(true);

    let emailVerified = false;
    let profileRow = null;
    let avatarUploadFailed = false;

    try {
      await runWithLoader("Verifying your email…", async () => {
        const { error: verifyError } = await verifySignupOtp({ email, token: code });
        if (verifyError) throw verifyError;
      });
      emailVerified = true;

      try {
        const { data: userData, error: userError } = await getUser();
        if (userError || !userData?.user) {
          throw userError || new Error("No signed-in user found after verification");
        }

        const userId = userData.user.id;
        profileRow = {
          id: userId,
          username,
          name: profileData.name,
          faculty: profileData.faculty,
          department: profileData.department,
          level: profileData.level,
          avatar_url: null,
          // The database trigger stamps terms_accepted_at; never send a client timestamp.
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
        };

        // Create the profile row first. Avatar upload is optional and cannot
        // prevent the consent record/profile identity from being saved.
        await runWithLoader("Finishing your account…", async () => {
          await createProfile(profileRow);
        });

        if (profileData.avatarFile) {
          try {
            const avatarUrl = await uploadToStorage("avatars", profileData.avatarFile, userId);
            try {
              await updateProfile(userId, { avatar_url: avatarUrl });
              profileRow = { ...profileRow, avatar_url: avatarUrl };
            } catch (profileUpdateError) {
              try { await removeUploadedFile("avatars", avatarUrl); }
              catch (cleanupError) { console.error("Failed to clean up an unused signup avatar:", cleanupError); }
              throw profileUpdateError;
            }
          } catch (avatarError) {
            avatarUploadFailed = true;
            console.error("Avatar upload failed after profile creation:", avatarError);
          }
        }
      } catch (profileError) {
        console.error("Profile creation failed after email verification:", profileError);
        throw profileError;
      }
    } catch (error) {
      if (emailVerified) {
        setOtpError("");
        setDigits(["", "", "", "", "", ""]);
        await refreshAuth();
        showToast("Email verified — finish your profile.");
        return;
      }

      const message = error?.message || "Couldn't verify — check the code and try again";
      setOtpError(message);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      return;
    } finally {
      setChecking(false);
    }

    showToast(
      avatarUploadFailed
        ? "Couldn't upload your photo — add it later from Edit profile"
        : "Account created successfully!",
      avatarUploadFailed ? "error" : ""
    );
    onComplete(profileRow);
  }

  async function handleResend() {
    if (cooldown > 0 || checking) return;
    setDigits(["", "", "", "", "", ""]);
    setOtpError("");
    inputRefs.current[0]?.focus();

    const { error } = await resendSignupOtp(email);
    if (error) {
      showToast(error.message || "Couldn't resend — try again shortly", "error");
      return;
    }
    showToast(`New code sent to ${email}`);
    setCooldown(30);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!showOtp) {
      await handleSendCode();
      return;
    }
    const code = digits.join("");
    if (code.length === 6) {
      await verifyCode(code);
      return;
    }
    showToast("Enter the 6-digit code", "error");
  }

  return (
    <form className="screen-enter" onSubmit={handleSubmit} noValidate>
      <BackButton onClick={() => (showOtp ? setShowOtp(false) : onBack())} />
      <div className="eyebrow">STEP 4 OF 4</div>
      <h2 className="display">Verify your email</h2>
      <p className="subtitle">We'll send a 6-digit code to confirm it's you.</p>

      {!showOtp ? (
        <>
          <p className="subtitle" style={{ marginTop: -16, marginBottom: 24 }}>
            A verification code will be sent to <strong>{email}</strong>
          </p>
          <div className="spacer" />
          <button type="submit" className="btn btn-primary" disabled={sending}>
            Send code to {email}
          </button>
        </>
      ) : (
        <>
          <p className="subtitle" style={{ marginTop: -16 }}>
            Enter the 6-digit code we sent to {email}.
          </p>
          <p className="hint" style={{ marginTop: -14, marginBottom: 16 }}>
            Didn't get it? Check your spam folder.
          </p>

          <div className="field">
            <label htmlFor="signup-otp-1">Enter the 6-digit code</label>
            <div className={`otp-row ${checking ? "checking" : ""}`}>
              {digits.map((digit, index) => (
                <input
                  key={index}
                  id={`signup-otp-${index + 1}`}
                  ref={(element) => (inputRefs.current[index] = element)}
                  maxLength={1}
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  className="otp-digit"
                  value={digit}
                  disabled={checking}
                  aria-label={`Verification code digit ${index + 1}`}
                  onChange={(event) => updateDigit(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  onPaste={handlePaste}
                />
              ))}
            </div>
            {otpError && (
              <div className="error" style={{ display: "block" }} role="alert">
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
          <div className="spacer" />
        </>
      )}
    </form>
  );
}
