import { useRef, useState } from "react";
import BackButton from "../common/BackButton";
import FacultyDepartmentPicker from "../common/FacultyDepartmentPicker";
import { getUser } from "../../services/supabase/auth";
import { createProfile } from "../../services/supabase/profiles";
import { uploadToStorage } from "../../services/supabase/storage";
import { useToast } from "../../hooks/useToast";
import { joinList } from "../../utils/validation";

export default function ProfileSetup({
  initialProfileData,
  onNext,
  onBack,
  resumeAccount,
  onComplete,
}) {
  const initial = initialProfileData || {};

  const [avatarPreview, setAvatarPreview] = useState(
    initial.avatarPreview || ""
  );
  const [avatarFile, setAvatarFile] = useState(initial.avatarFile || null);
  const [name, setName] = useState(initial.name || "");
  const [faculty, setFaculty] = useState(initial.faculty || "");
  const [department, setDepartment] = useState(initial.department || "");
  const [level, setLevel] = useState(initial.level || "");
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleContinue() {
    if (submitting) return;

    const missing = [];

    if (!name.trim()) missing.push("your name");
    if (!faculty) missing.push("your faculty");
    else if (!department) missing.push("your department");
    if (!level) missing.push("your level");

    if (missing.length > 0) {
      showToast(`Fill in ${joinList(missing)} to continue`, "error");
      return;
    }

    const profileData = {
      name: name.trim(),
      faculty,
      department,
      level,
      avatarFile,
      avatarPreview,
    };

    if (!resumeAccount) {
      onNext(profileData);
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await getUser();

      if (error || !data?.user || data.user.id !== resumeAccount.id) {
        throw error || new Error("Unable to resume your account");
      }

      const userId = data.user.id;
      let avatarUrl = "";

      if (avatarFile) {
        avatarUrl = await uploadToStorage("avatars", avatarFile, userId);
      }

      const profileRow = {
        id: userId,
        username:
          resumeAccount.username ||
          data.user.user_metadata?.username ||
          "",
        name: profileData.name,
        faculty: profileData.faculty,
        department: profileData.department,
        level: profileData.level,
        avatar_url: avatarUrl || null,
      };

      await createProfile(profileRow);
      showToast("Profile completed successfully!");
      onComplete?.(profileRow);
    } catch (err) {
      console.error("Profile resume failed:", err);
      showToast(
        err?.message || "Couldn't finish your profile — try again",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const valid = !!(name.trim() && faculty && department && level);

  return (
    <div className="screen-enter">
      <BackButton onClick={onBack} />

      <div className="eyebrow">STEP 3 OF 4</div>
      <h2 className="display">Complete your profile</h2>
      <p className="subtitle">This is how other students will see you.</p>

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
    </div>
  );
}
