import { useRef, useState } from "react";
import { FACULTIES } from "../../data/faculties";

// Type a faculty name, pick from the autocomplete, then a department
// bottom-sheet opens automatically — pick one and it collapses into a
// read-only "chip" with a Change button. Ported from createFacultyPicker
// + the #dept-modal in the vanilla build, as one self-contained component.
export default function FacultyDepartmentPicker({ faculty, department, onChange }) {
  const [query, setQuery] = useState(faculty || "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [modalFaculty, setModalFaculty] = useState(null); // non-null = modal open, listing this faculty's departments
  const [deptQuery, setDeptQuery] = useState("");
  const blurTimeout = useRef(null);
  const matches = Object.keys(FACULTIES).filter((f) => f.toLowerCase().includes(query.trim().toLowerCase()));

  function selectFaculty(facultyName) {
    setQuery(facultyName);
    setShowSuggestions(false);
    onChange({ faculty: facultyName, department: "" });
    setTimeout(() => { setModalFaculty(facultyName); setDeptQuery(""); }, 200);
  }

  function selectDepartment(dept) {
    onChange({ faculty: modalFaculty, department: dept });
    setModalFaculty(null);
  }

  const deptOptions = modalFaculty ? (FACULTIES[modalFaculty] || []) : [];
  const filteredDepts = deptOptions.filter((d) => d.toLowerCase().includes(deptQuery.trim().toLowerCase()));

  return (
    <>
      <div className="field autocomplete-field">
        <label htmlFor="profile-faculty">Faculty</label>
        <input
          id="profile-faculty"
          type="text"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (faculty && val !== faculty) onChange({ faculty: "", department: "" });
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => { blurTimeout.current = setTimeout(() => setShowSuggestions(false), 150); }}
          placeholder="Start typing your faculty"
          autoComplete="organization"
        />
        <div className={`suggestions ${showSuggestions && query.trim() ? "show" : ""}`}>
          {matches.length === 0
            ? <div className="suggestion-empty">No matching faculty</div>
            : matches.map((f) => (
                <div key={f} className="suggestion-item" onMouseDown={(e) => e.preventDefault()} onClick={() => selectFaculty(f)}>{f}</div>
              ))}
        </div>
      </div>

      {department && (
        <div className="field">
          <label htmlFor="profile-department">Department</label>
          <div className="dept-chip-wrap">
            <input id="profile-department" type="text" value={department} readOnly />
            <button type="button" className="dept-change-btn" onClick={() => { setModalFaculty(faculty); setDeptQuery(""); }}>Change</button>
          </div>
        </div>
      )}

      <div className={`modal-overlay ${modalFaculty ? "show" : ""}`} onClick={() => setModalFaculty(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <h2 className="display" style={{ fontSize: 19 }}>Select department</h2>
          <p className="modal-sub">{modalFaculty}</p>
          <label htmlFor="department-search" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>Search departments</label>
          <input id="department-search" type="text" placeholder="Search departments" value={deptQuery} onChange={(e) => setDeptQuery(e.target.value)} autoFocus />
          <div className="modal-list">
            {filteredDepts.length === 0
              ? <div className="suggestion-empty">No matching department</div>
              : filteredDepts.map((d) => (
                  <div key={d} className="suggestion-item" onClick={() => selectDepartment(d)}>{d}</div>
                ))}
          </div>
        </div>
      </div>
    </>
  );
}
