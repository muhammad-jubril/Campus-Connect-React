import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FacultyDepartmentPicker from "../components/common/FacultyDepartmentPicker";
import { useAuth } from "../hooks/useAuth";
import { useLoader } from "../hooks/useLoader";
import { useToast } from "../hooks/useToast";
import { updateProfile } from "../services/supabase/profiles";
import { uploadToStorage } from "../services/supabase/storage";
import { joinList } from "../utils/validation";

const MAX_NAME_LENGTH = 60;
const MAX_BIO_LENGTH = 160;

export default function EditProfilePage() {
  const { currentUser, setCurrentUser } = useAuth();
  const [name, setName] = useState(currentUser.name);
  const [bio, setBio] = useState(currentUser.bio || "");
  const [faculty, setFaculty] = useState(currentUser.faculty);
  const [department, setDepartment] = useState(currentUser.department);
  const [level, setLevel] = useState(currentUser.level);
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatarDataUrl || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
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

  async function handleSave() {
    if (submitting) return;
    const missing = [];
    if (!name.trim()) missing.push("your name");
    if (!faculty) missing.push("your faculty");
    else if (!department) missing.push("your department");
    if (!level) missing.push("your level");
    if (missing.length > 0) {
      showToast(`Fill in ${joinList(missing)} to save`, "error");
      return;
    }

    setSubmitting(true);
    try {
      await runWithLoader("Saving changes…", async () => {
        const savedName = name.trim();
        const savedBio = bio.trim();
        const bioValue = savedBio || null;
        let avatarUrl = currentUser.avatarDataUrl || null;
        if (avatarFile) avatarUrl = await uploadToStorage("avatars", avatarFile, currentUser.id);
        await updateProfile(currentUser.id, {
          name: savedName,
          bio: bioValue,
          faculty,
          department,
          level,
          avatar_url: avatarUrl,
        });
        setCurrentUser((prev) => ({
          ...prev,
          name: savedName,
          bio: savedBio,
          faculty,
          department,
          level,
          avatarDataUrl: avatarUrl || "",
        }));
      });
      showToast("Profile updated");
      navigate(-1);
    } catch (err) {
      console.error("Profile save failed:", err);
      showToast("Couldn't save — check your connection and try again", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="edit-profile-page">
      <div className="task-title">
        <span className="eyebrow">CAMPUS CONNECT</span>
        <h2 className="display">Edit profile</h2>
        <p>This is how other students will see you.</p>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
      <div className="avatar-picker" onClick={() => fileInputRef.current?.click()}>
        {avatarPreview ? <img src={avatarPreview} alt="" /> : "Add photo"}
      </div>

      <div className="field">
        <label>Full name</label>
        <input type="text" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </div>

      <div className="field">
        <label>Bio</label>
        <textarea
          className="post-textarea"
          style={{ minHeight: 70 }}
          value={bio}
          maxLength={MAX_BIO_LENGTH}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short line about you"
        />
        <div className="post-char-count"><span>{bio.length}</span>/{MAX_BIO_LENGTH}</div>
      </div>

      <FacultyDepartmentPicker faculty={faculty} department={department} onChange={({ faculty: nextFaculty, department: nextDepartment }) => { setFaculty(nextFaculty); setDepartment(nextDepartment); }} />

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
      <button type="button" className="btn btn-primary" onClick={handleSave}>Save changes</button>
    </div>
  );
}
