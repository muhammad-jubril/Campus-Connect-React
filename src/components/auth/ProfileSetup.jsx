import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import BackButton from "../common/BackButton";
import UsernameField from "../common/UsernameField";
import FacultyDepartmentPicker from "../common/FacultyDepartmentPicker";
import { getUser } from "../../services/supabase/auth";
import { checkUsernameAvailable, createProfile, updateProfile } from "../../services/supabase/profiles";
import { uploadToStorage, removeUploadedFile } from "../../services/supabase/storage";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { isReservedUsername, USERNAME_RE, joinList } from "../../utils/validation";
import { checkAvatar, uploadCheckMessage } from "../../utils/uploadChecks";
import { getUploadErrorMessage } from "../../utils/uploadErrors";
import { optimizeImage } from "../../utils/imageCompression";
import { TERMS_VERSION, PRIVACY_VERSION } from "../../utils/legalVersions";

const MAX_NAME_LENGTH = 60;
const RESERVED_USERNAME_MESSAGE = "That username isn't available";

export default function ProfileSetup({
  initialProfileData,
  onNext,
  onBack,
  resumeAccount,
  onComplete,
}) {
  const initial = initialProfileData || {};
  const isResume = !!resumeAccount;

  const [username, setUsername] = useState(
    resumeAccount?.username || initial.username || ""
  );
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(initial.avatarPreview || "");
  const [avatarFile, setAvatarFile] = useState(initial.avatarFile || null);
  const [name, setName] = useState(initial.name || "");
  const [faculty, setFaculty] = useState(initial.faculty || "");
  const [department, setDepartment] = useState(initial.department || "");
  const [level, setLevel] = useState(initial.level || "");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef(null);
  const { logout } = useAuth();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  const usernameReserved = isReservedUsername(username);
  const usernameValid = USERNAME_RE.test(username) && !usernameReserved;

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const result = checkAvatar(file);
    if (!result.ok) {
      showToast(uploadCheckMessage(result, "avatar"), "error");
      return;
    }

    try {
      const compressedFile = await optimizeImage(file, "avatar");
      setAvatarFile(compressedFile);
      const reader = new FileReader();
      reader.onload = (loadEvent) => setAvatarPreview(loadEvent.target.result);
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error("Avatar image processing failed:", error);
      showToast(error?.message || "Couldn\'t process that photo. Choose a JPEG, PNG, or WebP image.", "error");
    }
  }

  async function handleResumeContinue() {
    if (usernameReserved) {
      showToast(RESERVED_USERNAME_MESSAGE, "error");
      return;
    }

    if (!USERNAME_RE.test(username)) {
      showToast("Enter a valid username to continue", "error");
      return;
    }

    if (!termsAccepted) {
      setTermsError(true);
      showToast("Confirm you are 18 or older and agree to the Terms of Use and Privacy Policy to continue", "error");
      return;
    }

    setSubmitting(true);

    try {
      let available = true;

      await runWithLoader("Checking username…", async () => {
        available = await checkUsernameAvailable(username);
      });

      if (!available) {
        setUsernameTaken(true);
        return;
      }

      const { data, error } = await getUser();

      if (error || !data?.user || data.user.id !== resumeAccount.id) {
        throw error || new Error("Unable to resume your account");
      }

      const userId = data.user.id;

      const profileRow = {
        id: userId,
        username,
        name: name.trim(),
        faculty,
        department,
        level,
        avatar_url: null,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      };

      await createProfile(profileRow);

      if (avatarFile) {
        try {
          const avatarUrl = await uploadToStorage("avatars", avatarFile, userId);
          try {
            await updateProfile(userId, { avatar_url: avatarUrl });
            profileRow.avatar_url = avatarUrl;
          } catch (profileUpdateError) {
            try { await removeUploadedFile("avatars", avatarUrl); }
            catch (cleanupError) { console.error("Failed to clean up an unused profile-setup avatar:", cleanupError); }
            throw profileUpdateError;
          }
        } catch (avatarError) {
          console.error("Avatar upload failed after resume profile creation:", avatarError);
          const friendlyMessage = getUploadErrorMessage(avatarError, "avatar");
          showToast(friendlyMessage || "Couldn't upload your photo — add it later from Edit profile", "error");
        }
      }

      showToast("Profile completed successfully!");
      onComplete?.(profileRow);
    } catch (error) {
      console.error("Profile resume failed:", error);

      if (error?.code === "23505") {
        setUsernameTaken(true);
        return;
      }

      showToast(
        error?.message || "Couldn't finish your profile — try again",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinue(event) {
    event.preventDefault();
    if (submitting) return;

    if (isResume && usernameReserved) {
      showToast(RESERVED_USERNAME_MESSAGE, "error");
      return;
    }

    const missing = [];
    if (isResume && !usernameValid) missing.push("a valid username");
    if (!name.trim()) missing.push("your name");
    if (!faculty) missing.push("your faculty");
    else if (!department) missing.push("your department");
    if (!level) missing.push("your level");
    if (isResume && !termsAccepted) {
      missing.push("confirmation that you are 18 or older and agreement to the Terms of Use and Privacy Policy");
      setTermsError(true);
    }

    if (missing.length > 0) {
      showToast(`Fill in ${joinList(missing)} to continue`, "error");
      return;
    }

    if (!isResume) {
      onNext({
        username,
        name: name.trim(),
        faculty,
        department,
        level,
        avatarFile,
        avatarPreview,
      });
      return;
    }

    await handleResumeContinue();
  }

  async function handleLogout() {
    if (submitting) return;
    await logout();
  }

  const valid = !!(
    (!isResume || usernameValid) &&
    name.trim() &&
    faculty &&
    department &&
    level &&
    (!isResume || termsAccepted)
  );

  return (
    <form className="screen-enter" onSubmit={handleContinue} noValidate>
      {!isResume && <BackButton onClick={onBack} />}

      <div className="eyebrow">{isResume ? "FINISH YOUR PROFILE" : "STEP 3 OF 4"}</div>
      <h2 className="display">{isResume ? "Finish your profile" : "Complete your profile"}</h2>
      <p className="subtitle">
        {isResume
          ? "Add the remaining details before you enter Campus Connect."
          : "This is how other students will see you."}
      </p>

      {isResume && (
        <UsernameField
          value={username}
          onChange={(value) => {
            setUsername(value);
            setUsernameTaken(false);
          }}
          hintText={
            usernameTaken
              ? "That username is already taken — try another"
              : undefined
          }
          hintState={usernameTaken || usernameReserved ? "taken" : usernameValid ? "ok" : "default"}
          error={usernameTaken || usernameReserved}
        />
      )}

      <input
        id="profile-avatar"
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={handleAvatarChange}
        aria-label="Profile photo"
      />

      <div
        className="avatar-picker"
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-controls="profile-avatar"
        aria-label={avatarPreview ? "Change profile photo" : "Add profile photo"}
      >
        {avatarPreview ? <img src={avatarPreview} alt="" /> : "Add photo"}
      </div>

      <div className="field">
        <label htmlFor="profile-name">Full name</label>
        <input
          id="profile-name"
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          autoComplete="name"
        />
      </div>

      <FacultyDepartmentPicker
        faculty={faculty}
        department={department}
        onChange={({ faculty: nextFaculty, department: nextDepartment }) => {
          setFaculty(nextFaculty);
          setDepartment(nextDepartment);
        }}
      />

      <div className="field">
        <label htmlFor="profile-level">Level</label>
        <div className="select-wrap-full">
          <select id="profile-level" value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="">Select level</option>
            <option>100</option>
            <option>200</option>
            <option>300</option>
            <option>400</option>
            <option>500</option>
            <option>600</option>
          </select>
        </div>
      </div>

      {isResume && (
        <div className={`signup-consent profile-resume-consent ${termsError && !termsAccepted ? "has-error" : ""}`}>
          <input
            id="resume-legal-consent"
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => {
              setTermsAccepted(event.target.checked);
              setTermsError(false);
            }}
            aria-invalid={termsError && !termsAccepted}
            aria-describedby={termsError && !termsAccepted ? "resume-legal-error" : undefined}
            required
          />
          <div className="signup-consent-copy">
            <label htmlFor="resume-legal-consent">
              I confirm I am 18 or older and agree to the Terms of Use and Privacy Policy.
            </label>
            <div className="signup-consent-links">
              <Link to="/terms" target="_blank" rel="noreferrer">Read Terms</Link>
              <Link to="/privacy" target="_blank" rel="noreferrer">Read Privacy Policy</Link>
            </div>
            {termsError && !termsAccepted && (
              <p id="resume-legal-error" className="signup-consent-error" role="alert">
                You must confirm that you are 18 or older and accept both policies to finish your profile.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="spacer" />

      <button
        type="submit"
        className={`btn btn-primary ${!valid ? "is-invalid" : ""}`}
        disabled={submitting}
      >
        Continue
      </button>

      {isResume && (
        <button type="button" className="btn btn-ghost" onClick={handleLogout} disabled={submitting}>
          Log out / use a different account
        </button>
      )}
    </form>
  );
}
