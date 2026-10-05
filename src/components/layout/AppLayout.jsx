import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
<<<<<<< HEAD
=======
import Drawer from "./Drawer";
import Fab from "./Fab";
>>>>>>> 1322a16 (update)
import CommentsModal from "../feed/CommentsModal";

export default function AppLayout() {
  return (
    <div className="app-shell">
<<<<<<< HEAD
      <Sidebar />
      <div className="app-content-main">
        <Outlet />
      </div>
      <BottomNav />
=======
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
>>>>>>> 1322a16 (update)
      <CommentsModal />
    </div>
  );
}
