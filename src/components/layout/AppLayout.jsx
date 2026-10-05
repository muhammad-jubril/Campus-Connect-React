import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import Drawer from "./Drawer";
import Fab from "./Fab";
import CommentsModal from "../feed/CommentsModal";

export default function AppLayout() {
  return (
    <div className="app-shell">
      <BottomNav />

      <div className="desktop-app-body">
        <Sidebar />

        <div className="app-content">
          <div className="app-content-main" id="app-content-main">
            <Outlet />
          </div>
        </div>
      </div>

      <Fab />
      <Drawer />
      <CommentsModal />
    </div>
  );
}
