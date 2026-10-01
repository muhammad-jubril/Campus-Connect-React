import { Routes, Route } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { STATUS } from "../context/AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import PublicRoute from "./PublicRoute";

import AuthLayout from "../components/auth/AuthLayout";
import StepIndicator from "../components/auth/StepIndicator";
import ProfileSetup from "../components/auth/ProfileSetup";
import ResetPassword from "../components/auth/ResetPassword";
import AppLayout from "../components/layout/AppLayout";

import LandingPage from "../pages/LandingPage";
import LoginPage from "../pages/LoginPage";
import SignupPage from "../pages/SignupPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";
import WelcomePage from "../pages/WelcomePage";
import FeedPage from "../pages/FeedPage";
import CreatePostPage from "../pages/CreatePostPage";
import ProfilePage from "../pages/ProfilePage";
import EditProfilePage from "../pages/EditProfilePage";
import ComingSoonPage from "../pages/ComingSoonPage";
import TermsPage from "../pages/TermsPage";
import PrivacyPage from "../pages/PrivacyPage";
import NotFoundPage from "../pages/NotFoundPage";

export default function AppRoutes() {
  const { status, pendingAccount, completeSignIn } = useAuth();

  if (status === STATUS.LOADING) {
    return <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>Loading…</div>;
  }

  // These two statuses override whatever route was actually requested —
  // same principle as the vanilla build's PASSWORD_RECOVERY auth-event
  // listener and the "verified but no profile row" resume fix: someone in
  // either state needs to land on ONE specific screen no matter what URL
  // they hit, not get routed based on the URL like everything else.
  if (status === STATUS.NEEDS_PROFILE_SETUP) {
    return (
      <AuthLayout>
        <StepIndicator current={3} />
        <ProfileSetup
          username={pendingAccount?.username}
          email={pendingAccount?.email}
          onComplete={(profileRow) => completeSignIn(profileRow)}
        />
      </AuthLayout>
    );
  }

  if (status === STATUS.PASSWORD_RECOVERY) {
    return (
      <AuthLayout>
        <ResetPassword />
      </AuthLayout>
    );
  }

  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route element={<AppLayout />}>
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/create" element={<CreatePostPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/edit" element={<EditProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route
            path="/marketplace"
            element={<ComingSoonPage title="Marketplace" blurb="Buy, sell, and swap with other NWU students — not ported to React yet."
              icon={<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9 13a3 3 0 0 0 6 0" /></svg>} />}
          />
          <Route
            path="/notifications"
            element={<ComingSoonPage title="Notifications" blurb="Likes, comments, and updates — not ported to React yet."
              icon={<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>} />}
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
