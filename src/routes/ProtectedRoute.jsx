import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { STATUS } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status !== STATUS.SIGNED_IN) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
