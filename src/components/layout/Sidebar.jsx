import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const SearchIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
const PlusIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const GroupsIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const CommunityIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><path d="M9 6h6M18 9v6M15 18H9V9" /></svg>;
const LostIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /><path d="M8.5 11h5" /></svg>;
const SettingsIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.17 5.2l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" /></svg>;
const HelpIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-.8 1-2.1 1.2-2.1 2.7" /><path d="M12 17h.01" /></svg>;
const LogoutIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>;

function SidebarPanelLink({ to, panel, activePanel, onOpenPanel, children }) {
  return (
    <NavLink
      to={to}
      className={`desktop-sidebar-link${activePanel === panel ? " active" : ""}`}
      onClick={(event) => {
        if (window.matchMedia("(min-width: 768px)").matches && onOpenPanel) {
          event.preventDefault();
          onOpenPanel(panel);
        }
      }}
    >
      {children}
    </NavLink>
  );
}

export default function Sidebar({ activePanel, onOpenPanel }) {
  const { logout } = useAuth();
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
        <SidebarPanelLink to="/groups" panel="groups" activePanel={activePanel} onOpenPanel={onOpenPanel}><span className="desktop-sidebar-link-icon"><GroupsIcon /></span><span><b>Groups</b></span></SidebarPanelLink>
        <SidebarPanelLink to="/communities" panel="communities" activePanel={activePanel} onOpenPanel={onOpenPanel}><span className="desktop-sidebar-link-icon"><CommunityIcon /></span><span><b>Communities</b></span></SidebarPanelLink>
        <NavLink to="/lost-found" className="desktop-sidebar-link"><span className="desktop-sidebar-link-icon"><LostIcon /></span><span><b>Lost &amp; Found</b></span></NavLink>

        <div className="desktop-sidebar-section-label app-label">App</div>
        <SidebarPanelLink to="/settings" panel="settings" activePanel={activePanel} onOpenPanel={onOpenPanel}><span className="desktop-sidebar-link-icon"><SettingsIcon /></span><span><b>Settings</b></span></SidebarPanelLink>
        <NavLink to="/help" className="desktop-sidebar-link"><span className="desktop-sidebar-link-icon"><HelpIcon /></span><span><b>Help &amp; Support</b></span></NavLink>
      </div>

      <div className="sidebar-spacer" />

      <button type="button" className="desktop-sidebar-logout" onClick={logout}>
        <span className="desktop-sidebar-logout-icon"><LogoutIcon /></span>
        <span><b>Log out</b></span>
      </button>
    </nav>
  );
}
