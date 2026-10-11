import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FacultyDepartmentPicker from "../components/common/FacultyDepartmentPicker";
import { useAuth } from "../hooks/useAuth";
import { useLoader } from "../hooks/useLoader";
import { useToast } from "../hooks/useToast";
import { updateProfile } from "../services/supabase/profiles";
import { uploadToStorage, removeUploadedFile } from "../services/supabase/storage";
import { joinList } from "../utils/validation";
import { checkAvatar, uploadCheckMessage } from "../utils/uploadChecks";
import { getUploadErrorMessage } from "../utils/uploadErrors";
import { optimizeImage } from "../utils/imageCompression";

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

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    e.target.value = "";
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
      reader.onload = (ev) => setAvatarPreview(ev.target.result);
      reader.readAsDataURL(compressedFile);
    } catch (err) {
      console.error("Avatar image processing failed:", err);
      showToast(err?.message || "Couldn't process that photo. Choose a JPEG, PNG, or WebP image.", "error");
    }
  }

  async function handleSave() {
    if (submitting) return;

    const missing = [];
    if (!name.trim()) missing.push("your name");
    if (!faculty) missing.push("your faculty");
    else if (!department) missing.push("your department");
    if (!level) missing.push("your level");

    if (missing.length > 0) {
      showToast(\`Fill in ${joinList(missing)} to save\`, "error");
      return;
    }

    setSubmitting(true);
    let newlyUploadedAvatarUrl = null;
    const previousAvatarUrl = currentUser.avatarDataUrl || "";

    try {
      await runWithLoader("Saving changes…", async () => {
        let avatarUrl = previousAvatarUrl || null;

        if (avatarFile) {
          avatarUrl = await uploadToStorage("avatars", avatarFile, currentUser.id);
          newlyUploadedAvatarUrl = avatarUrl;
        }

        const savedName = name.trim();
        const savedBio = bio.trim();
        const bioValue = savedBio || null;

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
        newlyUploadedAvatarUrl = null;

        // Best-effort cleanup only after the database points to the replacement.
        // Ignore non-Supabase URLs (or already-missing legacy objects).
        if (
          avatarFile &&
          previousAvatarUrl &&
          previousAvatarUrl !== avatarUrl &&
          previousAvatarUrl.includes("/storage/v1/object/public/avatars/")
        ) {
          try {
            await removeUploadedFile("avatars", previousAvatarUrl);
          } catch (cleanupError) {
            console.error("Profile saved, but the previous avatar could not be removed:", cleanupError);
          }
        }
      });

      showToast("Profile updated");
      navigate(-1);
    } catch (err) {
      if (newlyUploadedAvatarUrl) {
        try { await removeUploadedFile("avatars", newlyUploadedAvatarUrl); }
        catch (cleanupError) { console.error("Failed to clean up an unused avatar upload:", cleanupError); }
      }
      console.error("Profile save failed:", err);
      const friendlyMessage = getUploadErrorMessage(err, "avatar");

      showToast(
        friendlyMessage ||
          "Couldn't save — check your connection and try again",
        "error"
      );
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
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
        />
      </div>

      <div className="field">
        <label htmlFor="profile-bio">Bio</label>
        <textarea
          id="profile-bio"
          className="post-textarea"
          style={{ minHeight: 70 }}
          value={bio}
          maxLength={MAX_BIO_LENGTH}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short line about you"
        />
        <div className="post-char-count">
          <span>{bio.length}</span>/{MAX_BIO_LENGTH}
        </div>
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
          <select
            id="profile-level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
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

      <div className="spacer" />

      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSave}
        disabled={submitting}
      >
        {submitting ? "Saving changes…" : "Save changes"}
      </button>
    </div>
  );
}
