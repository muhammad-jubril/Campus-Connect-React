import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import Drawer from "./Drawer";
import Fab from "./Fab";
import CommentsModal from "../feed/CommentsModal";
import DesktopRightPanel from "./DesktopRightPanel";

export default function AppLayout() {
  const location = useLocation();
  const [activePanel, setActivePanel] = useState(null);
  const isPostDetail = /^\/post\/[^/]+/.test(location.pathname);

  useEffect(() => {
    setActivePanel(null);
  }, [location.pathname]);

  useEffect(() => {
    const closePanelOnMobile = () => {
      if (!window.matchMedia("(min-width: 768px)").matches) {
        setActivePanel(null);
      }
    };

    window.addEventListener("resize", closePanelOnMobile);
    return () => window.removeEventListener("resize", closePanelOnMobile);
  }, []);

  function openRightPanel(panel) {
    setActivePanel((current) => current === panel ? null : panel);
  }

  return (
    <div className={`app-shell${isPostDetail ? " app-shell-post-detail" : ""}`}>
      <BottomNav />

      <div className="desktop-app-body">
        <Sidebar activePanel={activePanel} onOpenPanel={openRightPanel} />

        <div className="app-content">
          <div className="app-content-main" id="app-content-main">
            <Outlet context={{ openRightPanel }} />
          </div>
        </div>

        <DesktopRightPanel activePanel={activePanel} onClose={() => setActivePanel(null)} />
      </div>

      <Fab />
      <Drawer />
      <CommentsModal />
    </div>
  );
}
