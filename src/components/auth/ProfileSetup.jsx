import { useRef, useState } from "react";
import BackButton from "../common/BackButton";
import FacultyDepartmentPicker from "../common/FacultyDepartmentPicker";
import { useToast } from "../../hooks/useToast";
import { joinList } from "../../utils/validation";

export default function ProfileSetup({ onNext, onBack }) {
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [name, setName] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  function handleContinue() {
    const missing = [];
    if (!name.trim()) missing.push("your name");
    if (!faculty) missing.push("your faculty");
    else if (!department) missing.push("your department");
    if (!level) missing.push("your level");
    if (missing.length > 0) {
      showToast(`Fill in ${joinList(missing)} to continue`, "error");
      return;
    }
    onNext({ name: name.trim(), faculty, department, level, avatarFile });
  }

  const valid = !!(name.trim() && faculty && department && level);

  return (
    <div className="screen-enter">
      <BackButton onClick={onBack} />
      <div className="eyebrow">STEP 3 OF 4</div>
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
      <button type="button" className={`btn btn-primary ${!valid ? "is-invalid" : ""}`} onClick={handleContinue}>
        Continue
      </button>
    </div>
  );
}
