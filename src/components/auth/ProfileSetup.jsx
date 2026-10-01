import { useRef, useState } from "react";
import BackButton from "../common/BackButton";
import FacultyDepartmentPicker from "../common/FacultyDepartmentPicker";
import { createProfile } from "../../services/supabase/profiles";
import { uploadToStorage } from "../../services/supabase/storage";
import { getUser } from "../../services/supabase/auth";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { joinList } from "../../utils/validation";

// Used both for a fresh signup's Step 3, and for resuming someone who
// verified their email but closed the app before finishing this step
// (see AuthContext's NEEDS_PROFILE_SETUP status) — either way, all this
// needs is a username + email; it doesn't care how it got them.
export default function ProfileSetup({ username, email, onComplete, onBack }) {
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [name, setName] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const { runWithLoader } = useLoader();
  const { showToast } = useToast();

  function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleFinish() {
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

    setSubmitting(true);
    try {
      let profileRow;
      await runWithLoader("Setting up your profile…", async () => {
        const { data: userData, error: userError } = await getUser();
        if (userError || !userData.user) throw userError || new Error("No signed-in user found");
        const userId = userData.user.id;

        let avatarUrl = "";
        if (avatarFile) avatarUrl = await uploadToStorage("avatars", avatarFile, userId);

        profileRow = {
          id: userId, username, name: name.trim(), faculty, department, level, avatar_url: avatarUrl || null,
        };
        await createProfile(profileRow);
      });
      onComplete(profileRow);
    } catch (err) {
      console.error("Finishing signup failed:", err);
      const msg = err && err.message && err.message.includes("duplicate")
        ? "That username was just taken — go back and pick another"
        : "Couldn't finish setting up your profile — check your connection and try again";
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const valid = !!(name.trim() && faculty && department && level);

  return (
    <div className="screen-enter">
      {onBack && <BackButton onClick={onBack} />}
      <div className="eyebrow">STEP 3 OF 3</div>
      <h2 className="display">Complete your profile</h2>
      <p className="subtitle">This is how other students will see you.</p>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
      <div className="avatar-picker" onClick={() => fileInputRef.current?.click()}>
        {avatarPreview ? <img src={avatarPreview} alt="" /> : "Add photo"}
      </div>

      <div className="field">
        <label>Full name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </div>

      <FacultyDepartmentPicker
        faculty={faculty}
        department={department}
        onChange={({ faculty: f, department: d }) => { setFaculty(f); setDepartment(d); }}
      />

      <div className="field">
        <label>Level</label>
        <div className="select-wrap-full">
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Select level</option>
            <option>100</option><option>200</option><option>300</option><option>400</option><option>500</option>
          </select>
        </div>
      </div>

      <div className="spacer" />
      <button type="button" className={`btn btn-primary ${!valid ? "is-invalid" : ""}`} onClick={handleFinish}>
        Finish
      </button>
    </div>
  );
}
