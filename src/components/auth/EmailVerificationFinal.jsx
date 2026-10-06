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
import { uploadToStorage } from "../../services/supabase/storage";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";

export default function EmailVerificationFinal({
  username,
  password,
  email,
  profileData,
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
    if (cooldown <= 0) return;

    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSendCode() {
    if (sending) return;

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

      if (data?.session) {
        await signOut();
        throw new Error(
          "Email verification is required before entering Campus Connect"
        );
      }

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
    } finally {
      setSending(false);
    }
  }

  function updateDigit(i, raw) {
    const value = raw.replace(/[^0-9]/g, "").slice(-1);
    const next = [...digits];
    next[i] = value;
    setDigits(next);

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

    let emailVerified = false;
    let profileRow = null;
    let avatarUploadFailed = false;

    try {
      await runWithLoader("Verifying your email…", async () => {
        const { error: verifyError } = await verifySignupOtp({
          email,
          token: code,
        });

        if (verifyError) throw verifyError;
      });

      // From this point onward the OTP has been consumed successfully.
      emailVerified = true;

      try {
        const { data: userData, error: userError } = await getUser();

        if (userError || !userData?.user) {
          throw (
            userError ||
            new Error("No signed-in user found after verification")
          );
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
        };

        // Create the account's profile identity first. The avatar is optional
        // and must never prevent the profile row from being created.
        await runWithLoader("Finishing your account…", async () => {
          await createProfile(profileRow);
        });

        if (profileData.avatarFile) {
          try {
            const avatarUrl = await uploadToStorage(
              "avatars",
              profileData.avatarFile,
              userId
            );
            await updateProfile(userId, { avatar_url: avatarUrl });
            profileRow = { ...profileRow, avatar_url: avatarUrl };
          } catch (avatarError) {
            avatarUploadFailed = true;
            console.error("Avatar upload failed after profile creation:", avatarError);
          }
        }
      } catch (profileError) {
        console.error("Profile creation failed after email verification:", profileError);
        throw profileError;
      }
    } catch (err) {
      if (emailVerified) {
        setOtpError("");
        setDigits(["", "", "", "", "", ""]);
        await refreshAuth();
        showToast("Email verified — finish your profile.", "error");
        return;
      }

      const msg =
        err?.message || "Couldn't verify — check the code and try again";

      setOtpError(msg);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
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
      showToast(
        error.message || "Couldn't resend — try again shortly",
        "error"
      );
      return;
    }

    showToast(`New code sent to ${email}`);
    setCooldown(30);
  }

  return (
    <div className="screen-enter">
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
            A verification code will be sent to {""}
            <strong>{email}</strong>
          </p>

          <div className="spacer" />

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSendCode}
            disabled={sending}
          >
            Send code to {email}
          </button>
        </>
      ) : (
        <>
          <p className="subtitle" style={{ marginTop: -16 }}>
            Enter the 6-digit code we sent to {email}.
          </p>

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

          <div className="spacer" />
        </>
      )}
    </div>
  );
}
