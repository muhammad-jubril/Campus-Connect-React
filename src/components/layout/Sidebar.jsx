import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const itemClass = ({ isActive }) => `sidebar-item ${isActive ? "active" : ""}`;

export default function Sidebar() {
  const { logout } = useAuth();
  return (
    <nav className="sidebar">
      <div className="sidebar-brand"><img src="/icons/icon-192.png" alt="" className="brand-dot" />Campus Connect</div>
      <NavLink to="/feed" className={itemClass} end>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>
        Home
      </NavLink>
      <NavLink to="/marketplace" className={itemClass}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9 13a3 3 0 0 0 6 0" /></svg>
        Marketplace
      </NavLink>
      <NavLink to="/create" className="sidebar-item sidebar-create">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Create
      </NavLink>
      <NavLink to="/notifications" className={itemClass}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        Notifications
      </NavLink>
      <NavLink to="/profile" className={itemClass}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>
        Profile
      </NavLink>
      <div style={{ flex: 1 }} />
      <button type="button" className="sidebar-item" style={{ border: "none", width: "100%", cursor: "pointer" }} onClick={logout}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
        Log out
      </button>
    </nav>
  );
}
