import { NavLink } from "react-router-dom";

const navClass = ({ isActive }) => `bottom-nav-item ${isActive ? "active" : ""}`;

export default function BottomNav() {
  return (
<<<<<<< HEAD
    <nav className="bottom-nav">
      <NavLink to="/feed" className={navClass} end aria-label="Home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>
      </NavLink>
      <NavLink to="/marketplace" className={navClass} aria-label="Marketplace">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9 13a3 3 0 0 0 6 0" /></svg>
      </NavLink>
      <NavLink to="/create" className={navClass} aria-label="Create post">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </NavLink>
      <NavLink to="/notifications" className={navClass} aria-label="Notifications">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
=======
    <nav className="bottom-nav" aria-label="Primary navigation">
      <NavLink to="/feed" className={navClass} end aria-label="Campus Feed">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>
        <span className="bottom-nav-label">Campus Feed</span>
      </NavLink>
      <NavLink to="/marketplace" className={navClass} aria-label="Marketplace">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9 13a3 3 0 0 0 6 0" /></svg>
        <span className="bottom-nav-label">Marketplace</span>
      </NavLink>
      <NavLink to="/notifications" className={navClass} aria-label="Notifications">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        <span className="bottom-nav-label">Notifications</span>
>>>>>>> 1322a16 (update)
        <span className="nav-badge" />
      </NavLink>
      <NavLink to="/profile" className={navClass} aria-label="Profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>
<<<<<<< HEAD
=======
        <span className="bottom-nav-label">Profile</span>
>>>>>>> 1322a16 (update)
      </NavLink>
    </nav>
  );
}
