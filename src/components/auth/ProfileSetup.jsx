import { useRef, useState } from "react";
import BackButton from "../common/BackButton";
import UsernameField from "../common/UsernameField";
import FacultyDepartmentPicker from "../common/FacultyDepartmentPicker";
import { getUser } from "../../services/supabase/auth";
import { checkUsernameAvailable, createProfile, updateProfile } from "../../services/supabase/profiles";
import { uploadToStorage } from "../../services/supabase/storage";
import { useAuth } from "../../hooks/useAuth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { isReservedUsername, USERNAME_RE, joinList } from "../../utils/validation";
import { checkAvatar, uploadCheckMessage } from "../../utils/uploadChecks";
import { getUploadErrorMessage } from "../../utils/uploadErrors";
import { compressImage } from "../../utils/imageCompression";

const MAX_NAME_LENGTH = 60;
const MAX_AVATAR_DIMENSION = 512;
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
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef(null);
  const { logout } = useAuth();
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  const usernameReserved = isReservedUsername(username);
  const usernameValid = USERNAME_RE.test(username) && !usernameReserved;

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const result = checkAvatar(file);
    if (!result.ok) {
      showToast(uploadCheckMessage(result, "avatar"), "error");
      return;
    }

    try {
      const compressedFile = await compressImage(file, MAX_AVATAR_DIMENSION, 0.8);
      setAvatarFile(compressedFile);
      const reader = new FileReader();
      reader.onload = (ev) => setAvatarPreview(ev.target.result);
      reader.readAsDataURL(compressedFile);
    } catch (err) {
      console.error("Avatar image processing failed:", err);
      showToast("That file type isn't supported", "error");
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
      };

      await createProfile(profileRow);

      if (avatarFile) {
        try {
          const avatarUrl = await uploadToStorage("avatars", avatarFile, userId);
          await updateProfile(userId, { avatar_url: avatarUrl });
          profileRow.avatar_url = avatarUrl;
        } catch (avatarError) {
          console.error("Avatar upload failed after resume profile creation:", avatarError);
          const friendlyMessage = getUploadErrorMessage(avatarError, "avatar");
          showToast(friendlyMessage || "Couldn't upload your photo — add it later from Edit profile", "error");
        }
      }

      showToast("Profile completed successfully!");
      onComplete?.(profileRow);
    } catch (err) {
      console.error("Profile resume failed:", err);

      if (err?.code === "23505") {
        setUsernameTaken(true);
        return;
      }

      showToast(
        err?.message || "Couldn't finish your profile — try again",
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
    level
  );

  return (
    <form className="screen-enter" onSubmit={handleContinue}>
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
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
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
        />
      </div>

      <FacultyDepartmentPicker
        faculty={faculty}
        department={department}
        onChange={({ faculty: f, department: d }) => {
          setFaculty(f);
          setDepartment(d);
        }}
      />

      <div className="field">
        <label htmlFor="profile-level">Level</label>
        <div className="select-wrap-full">
          <select id="profile-level" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Select level</option>
            <option>100</option>
            <option>200</option>
            <option>300</option>
            <option>400</option>
            <option>500</option>
          </select>
        </div>
      </div>

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
