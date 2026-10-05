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
<<<<<<< HEAD
=======
import ScreenLayout from "../components/layout/ScreenLayout";
>>>>>>> 1322a16 (update)

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
<<<<<<< HEAD
=======
import SearchStudentsPage from "../pages/SearchStudentsPage";
>>>>>>> 1322a16 (update)
import ComingSoonPage from "../pages/ComingSoonPage";
import TermsPage from "../pages/TermsPage";
import PrivacyPage from "../pages/PrivacyPage";
import NotFoundPage from "../pages/NotFoundPage";

<<<<<<< HEAD
=======
const icon = (path) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

>>>>>>> 1322a16 (update)
export default function AppRoutes() {
  const { status, pendingAccount, completeSignIn } = useAuth();

  if (status === STATUS.LOADING) {
<<<<<<< HEAD
    return <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>Loading…</div>;
  }

  // These two statuses override whatever route was actually requested —
  // same principle as the vanilla build's PASSWORD_RECOVERY auth-event
  // listener and the "verified but no profile row" resume fix: someone in
  // either state needs to land on ONE specific screen no matter what URL
  // they hit, not get routed based on the URL like everything else.
=======
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        Loading…
      </div>
    );
  }

>>>>>>> 1322a16 (update)
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
<<<<<<< HEAD
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
=======

        {/* The four primary destinations share the persistent app shell. */}
        <Route element={<AppLayout />}>
          <Route path="/feed" element={<FeedPage />} />
          <Route
            path="/marketplace"
            element={
              <ComingSoonPage
                eyebrow="CAMPUS MARKET"
                title="Marketplace"
                blurb="Buy, sell, and swap with other NWU students — coming soon."
                icon={icon("M4 9l1.5-5h13L20 9M4 9h16v10a1 1 0 0 1-1-1zM9 13a3 3 0 0 0 6 0")}
                shell
              />
            }
          />
          <Route
            path="/notifications"
            element={
              <ComingSoonPage
                eyebrow="ACTIVITY"
                title="Notifications"
                blurb="Likes, comments, and campus updates will appear here — coming soon."
                icon={icon("M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0")}
                shell
              />
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* These are full screens in the vanilla shell, so the persistent
            nav disappears and the in-screen back/close control is visible. */}
        <Route
          path="/search"
          element={
            <ScreenLayout>
              <SearchStudentsPage />
            </ScreenLayout>
          }
        />
        <Route
          path="/create"
          element={
            <ScreenLayout close flex>
              <CreatePostPage />
            </ScreenLayout>
          }
        />
        <Route
          path="/profile/edit"
          element={
            <ScreenLayout flex>
              <EditProfilePage />
            </ScreenLayout>
          }
        />
        <Route
          path="/profile/:username"
          element={
            <ScreenLayout>
              <ProfilePage />
            </ScreenLayout>
          }
        />
        <Route
          path="/groups"
          element={
            <ScreenLayout>
              <ComingSoonPage
                title="Groups"
                blurb="Find and join student groups around campus — coming soon."
                icon={icon("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 3.13a4 4 0 0 1 0 7.75")}
              />
            </ScreenLayout>
          }
        />
        <Route
          path="/communities"
          element={
            <ScreenLayout>
              <ComingSoonPage
                title="Communities"
                blurb="Discover campus communities and shared interests — coming soon."
                icon={icon("M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1 4.7-7.6")}
              />
            </ScreenLayout>
          }
        />
        <Route
          path="/lost-found"
          element={
            <ScreenLayout>
              <ComingSoonPage
                title="Lost & Found"
                blurb="Help students reunite with things they have lost on campus — coming soon."
                icon={icon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4M8.5 11h5")}
              />
            </ScreenLayout>
          }
        />
        <Route
          path="/settings"
          element={
            <ScreenLayout>
              <ComingSoonPage
                title="Settings"
                blurb="Account and app preferences will live here — coming soon."
                icon={icon("M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8")}
              />
            </ScreenLayout>
          }
        />
        <Route
          path="/help"
          element={
            <ScreenLayout>
              <ComingSoonPage
                title="Help & Support"
                blurb="Guides, support, and the Campus Connect app tour will live here."
                icon={icon("M12 17h.01M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-.8 1-2.1 1.2-2.1 2.7M12 3a9 9 0 1 0 0 18 9 9 0 0 0-9-9")}
              />
            </ScreenLayout>
          }
        />
        <Route
          path="/chats"
          element={
            <ScreenLayout>
              <ComingSoonPage
                title="Chats"
                blurb="Private student messaging is coming soon."
                icon={icon("M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7")}
              />
            </ScreenLayout>
          }
        />
>>>>>>> 1322a16 (update)
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
