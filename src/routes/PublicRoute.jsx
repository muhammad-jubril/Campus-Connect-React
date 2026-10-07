import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { STATUS } from "../context/AuthContext";

function getSafeDestination(locationState) {
  const from = locationState?.from;
  const pathname = typeof from?.pathname === "string" ? from.pathname : "";

  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) {
    return "/feed";
  }

  const search = typeof from.search === "string" ? from.search : "";
  const hash = typeof from.hash === "string" ? from.hash : "";
  return `${pathname}${search}${hash}`;
}

// Landing/login/signup/forgot-password — someone already signed in has no
// reason to see these, send them to the original protected destination when
// one exists, otherwise straight to the feed.
export default function PublicRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === STATUS.SIGNED_IN) {
    return <Navigate to={getSafeDestination(location.state)} replace />;
  }

  return <Outlet />;
}
