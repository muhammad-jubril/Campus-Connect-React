import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { STATUS } from "../context/AuthContext";

// Landing/login/signup/forgot-password — someone already signed in has no
// reason to see these, send them straight to the feed instead.
export default function PublicRoute() {
  const { status } = useAuth();
  if (status === STATUS.SIGNED_IN) return <Navigate to="/feed" replace />;
  return <Outlet />;
}
