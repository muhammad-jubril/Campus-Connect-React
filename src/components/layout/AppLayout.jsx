import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import CommentsModal from "../feed/CommentsModal";

export default function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content-main">
        <Outlet />
      </div>
      <BottomNav />
      <CommentsModal />
    </div>
  );
}
