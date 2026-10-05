<<<<<<< HEAD
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
=======
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import Avatar from "../common/Avatar";

const SearchIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
const PlusIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const GroupsIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const CommunityIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><path d="M9 6h6M18 9v6M15 18H9V9" /></svg>;
const LostIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /><path d="M8.5 11h5" /></svg>;
const SettingsIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.17 5.2l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" /></svg>;
const HelpIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-.8 1-2.1 1.2-2.1 2.7" /><path d="M12 17h.01" /></svg>;
const LogoutIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>;

export default function Sidebar() {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="sidebar" aria-label="Campus sidebar">
      <div className="sidebar-brand">
        <img src="/icons/icon-192.png" alt="" className="brand-dot" />
        <span>Campus Connect</span>
      </div>

      <button type="button" className="desktop-sidebar-search" onClick={() => navigate("/search")} aria-label="Search students">
        <span className="desktop-sidebar-search-icon"><SearchIcon /></span>
        <span><b>Search students</b></span>
      </button>

      <NavLink to="/create" className="sidebar-item sidebar-create">
        <PlusIcon />
        Create
      </NavLink>

      <div className="desktop-sidebar-campus">
        <div className="desktop-sidebar-section-label">Campus</div>
        <NavLink to="/groups" className="desktop-sidebar-link"><span className="desktop-sidebar-link-icon"><GroupsIcon /></span><span><b>Groups</b></span></NavLink>
        <NavLink to="/communities" className="desktop-sidebar-link"><span className="desktop-sidebar-link-icon"><CommunityIcon /></span><span><b>Communities</b></span></NavLink>
        <NavLink to="/lost-found" className="desktop-sidebar-link"><span className="desktop-sidebar-link-icon"><LostIcon /></span><span><b>Lost &amp; Found</b></span></NavLink>

        <div className="desktop-sidebar-section-label app-label">App</div>
        <NavLink to="/settings" className="desktop-sidebar-link"><span className="desktop-sidebar-link-icon"><SettingsIcon /></span><span><b>Settings</b></span></NavLink>
        <NavLink to="/help" className="desktop-sidebar-link"><span className="desktop-sidebar-link-icon"><HelpIcon /></span><span><b>Help &amp; Support</b></span></NavLink>
      </div>

      <button type="button" className="desktop-sidebar-logout" onClick={logout}>
        <span className="desktop-sidebar-logout-icon"><LogoutIcon /></span>
        <span><b>Log out</b></span>
      </button>

      <div className="sidebar-spacer" />

      <button type="button" className="sidebar-profile-mini" onClick={() => navigate("/profile")}>
        <Avatar person={currentUser} size="sm" />
        <span className="sidebar-profile-mini-copy">
          <strong>{currentUser?.name || "Campus student"}</strong>
          <span>@{currentUser?.username || "username"}</span>
        </span>
        <span className="sidebar-profile-chevron" aria-hidden="true">›</span>
>>>>>>> 1322a16 (update)
      </button>
    </nav>
  );
}
