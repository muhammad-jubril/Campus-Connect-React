import { useRef, useState } from "react";
import BackButton from "../common/BackButton";
import FacultyDepartmentPicker from "../common/FacultyDepartmentPicker";
<<<<<<< HEAD
import { useToast } from "../../hooks/useToast";
import { joinList } from "../../utils/validation";

export default function ProfileSetup({ onNext, onBack }) {
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [name, setName] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
=======
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

>>>>>>> 1322a16 (update)
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  function handleAvatarChange(e) {
<<<<<<< HEAD
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
=======
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarFile(file);

>>>>>>> 1322a16 (update)
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

<<<<<<< HEAD
  function handleContinue() {
    const missing = [];
=======
  async function handleContinue() {
    if (submitting) return;

    const missing = [];

>>>>>>> 1322a16 (update)
    if (!name.trim()) missing.push("your name");
    if (!faculty) missing.push("your faculty");
    else if (!department) missing.push("your department");
    if (!level) missing.push("your level");
<<<<<<< HEAD
=======

>>>>>>> 1322a16 (update)
    if (missing.length > 0) {
      showToast(`Fill in ${joinList(missing)} to continue`, "error");
      return;
    }
<<<<<<< HEAD
    onNext({ name: name.trim(), faculty, department, level, avatarFile });
=======

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
>>>>>>> 1322a16 (update)
  }

  const valid = !!(name.trim() && faculty && department && level);

  return (
    <div className="screen-enter">
      <BackButton onClick={onBack} />
<<<<<<< HEAD
=======

>>>>>>> 1322a16 (update)
      <div className="eyebrow">STEP 3 OF 4</div>
      <h2 className="display">Complete your profile</h2>
      <p className="subtitle">This is how other students will see you.</p>

<<<<<<< HEAD
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
      <div className="avatar-picker" onClick={() => fileInputRef.current?.click()}>
=======
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
>>>>>>> 1322a16 (update)
        {avatarPreview ? <img src={avatarPreview} alt="" /> : "Add photo"}
      </div>

      <div className="field">
        <label>Full name</label>
<<<<<<< HEAD
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
=======
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
>>>>>>> 1322a16 (update)
      </div>

      <FacultyDepartmentPicker
        faculty={faculty}
        department={department}
<<<<<<< HEAD
        onChange={({ faculty: f, department: d }) => { setFaculty(f); setDepartment(d); }}
=======
        onChange={({ faculty: f, department: d }) => {
          setFaculty(f);
          setDepartment(d);
        }}
>>>>>>> 1322a16 (update)
      />

      <div className="field">
        <label>Level</label>
        <div className="select-wrap-full">
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Select level</option>
<<<<<<< HEAD
            <option>100</option><option>200</option><option>300</option><option>400</option><option>500</option>
=======
            <option>100</option>
            <option>200</option>
            <option>300</option>
            <option>400</option>
            <option>500</option>
>>>>>>> 1322a16 (update)
          </select>
        </div>
      </div>

      <div className="spacer" />
<<<<<<< HEAD
      <button type="button" className={`btn btn-primary ${!valid ? "is-invalid" : ""}`} onClick={handleContinue}>
=======

      <button
        type="button"
        className={`btn btn-primary ${!valid ? "is-invalid" : ""}`}
        onClick={handleContinue}
        disabled={submitting}
      >
>>>>>>> 1322a16 (update)
        Continue
      </button>
    </div>
  );
}
