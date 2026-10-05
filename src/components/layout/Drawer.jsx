import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import Avatar from "../common/Avatar";

const GroupsIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const CommunityIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>;
const LostIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /><path d="M8.5 11h5" /></svg>;
const SettingsIcon = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 17.84 5.2l-.06.06A1.7 1.7 0 0 0 16 6.6v.09A1.7 1.7 0 0 0 17 8.4a1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 21.76 10.8l-.06.06A1.7 1.7 0 0 0 20.4 13a1.7 1.7 0 0 0-1 2z" /></svg>;
const HelpIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-.8 1-2.1 1.2-2.1 2.7" /><path d="M12 17h.01" /></svg>;
const LogoutIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>;
const CloseIcon = () => <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4zM18.6 5 6 17.6l-1.4-1.4L17.2 3.6z" /></svg>;

export default function Drawer() {
  const [open, setOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const openDrawer = () => {
      setOpen(true);
      navigate(location.pathname, {
        state: { ...(location.state || {}), drawer: true },
      });
    };

    window.addEventListener("campus-connect:open-drawer", openDrawer);
    return () => window.removeEventListener("campus-connect:open-drawer", openDrawer);
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!location.state?.drawer) {
      setOpen(false);
    }
  }, [location.key, location.state]);

  useEffect(() => {
    document.body.classList.toggle("drawer-open", open);
    return () => document.body.classList.remove("drawer-open");
  }, [open]);

  const closeDrawer = () => {
    if (location.state?.drawer) {
      navigate(-1);
      return;
    }
    setOpen(false);
  };

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/");
  };

  return (
    <>
      <div className={`drawer-overlay ${open ? "open" : ""}`} onClick={closeDrawer} aria-hidden="true" />
      <nav className={`drawer-panel ${open ? "open" : ""}`} aria-label="More navigation" aria-hidden={!open}>
        <div className="drawer-top">
          <span className="drawer-kicker">CAMPUS CONNECT</span>
          <button type="button" className="drawer-close" onClick={closeDrawer} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>

        <button type="button" className="drawer-profile" onClick={() => go("/profile")}>
          <Avatar person={currentUser} size="md" />
          <span className="drawer-profile-copy">
            <span className="drawer-profile-name">{currentUser?.name || "Campus student"}</span>
            <span className="drawer-profile-username">@{currentUser?.username || "username"}</span>
          </span>
          <span className="drawer-profile-arrow">→</span>
        </button>

        <div className="drawer-section-label">Campus</div>
        <button type="button" className="drawer-link" onClick={() => go("/groups")}>
          <span className="drawer-link-icon drawer-link-icon-svg"><GroupsIcon /></span>
          <span><b>Groups</b></span>
        </button>
        <button type="button" className="drawer-link" onClick={() => go("/communities")}>
          <span className="drawer-link-icon drawer-link-icon-svg"><CommunityIcon /></span>
          <span><b>Communities</b></span>
        </button>
        <button type="button" className="drawer-link" onClick={() => go("/lost-found")}>
          <span className="drawer-link-icon drawer-link-icon-svg"><LostIcon /></span>
          <span><b>Lost &amp; Found</b></span>
        </button>

        <div className="drawer-section-label">App</div>
        <button type="button" className="drawer-link" onClick={() => go("/settings")}>
          <span className="drawer-link-icon drawer-link-icon-svg"><SettingsIcon /></span>
          <span><b>Settings</b></span>
        </button>
        <button type="button" className="drawer-link" onClick={() => go("/help")}>
          <span className="drawer-link-icon drawer-link-icon-svg"><HelpIcon /></span>
          <span><b>Help &amp; Support</b></span>
        </button>

        <div className="drawer-spacer" />
        <div className="drawer-footer-line" />
        <button type="button" className="drawer-link drawer-link-danger" onClick={handleLogout}>
          <span className="drawer-link-icon drawer-danger-icon"><LogoutIcon /></span>
          <span><b>Log out</b></span>
        </button>
        <div className="drawer-brand-foot">
          <img src="/icons/icon-192.png" alt="Campus Connect" className="brand-dot" />
        </div>
      </nav>
    </>
  );
}
