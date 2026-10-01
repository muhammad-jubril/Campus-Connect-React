import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { STATUS } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { status } = useAuth();
  if (status !== STATUS.SIGNED_IN) return <Navigate to="/" replace />;
  return <Outlet />;
}
