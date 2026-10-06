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
import { USERNAME_RE, joinList } from "../../utils/validation";

const MAX_NAME_LENGTH = 60;

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

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleResumeContinue() {
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
          showToast("Couldn't upload your photo — add it later from Edit profile", "error");
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

  async function handleContinue() {
    if (submitting) return;

    const missing = [];
    if (isResume && !USERNAME_RE.test(username)) missing.push("a valid username");
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

  const usernameValid = USERNAME_RE.test(username);
  const valid = !!(
    (!isResume || usernameValid) &&
    name.trim() &&
    faculty &&
    department &&
    level
  );

  return (
    <div className="screen-enter">
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
          hintState={usernameTaken ? "taken" : usernameValid ? "ok" : "default"}
          error={usernameTaken}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleAvatarChange}
      />

      <div
        className="avatar-picker"
        onClick={() => fileInputRef.current?.click()}
      >
        {avatarPreview ? <img src={avatarPreview} alt="" /> : "Add photo"}
      </div>

      <div className="field">
        <label>Full name</label>
        <input
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
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
        <label>Level</label>
        <div className="select-wrap-full">
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
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
        type="button"
        className={`btn btn-primary ${!valid ? "is-invalid" : ""}`}
        onClick={handleContinue}
        disabled={submitting}
      >
        Continue
      </button>

      {isResume && (
        <button type="button" className="btn btn-ghost" onClick={handleLogout} disabled={submitting}>
          Log out / use a different account
        </button>
      )}
    </div>
  );
}
