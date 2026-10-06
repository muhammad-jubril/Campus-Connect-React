import { createContext, useEffect, useRef, useState } from "react";
import {
  signInWithPassword, signOut as supabaseSignOut, getSession, onAuthStateChange,
} from "../services/supabase/auth";
import { getProfile, personFromProfileRow } from "../services/supabase/profiles";
import { classifyAuthError } from "../utils/authErrors";

export const AuthContext = createContext(null);

const PROFILE_LOAD_TIMEOUT_MS = 10_000;

// Every possible state the app can be in regarding "who is this and are
// they fully set up" — the routes react to this rather than each doing
// their own ad-hoc session checks.
const STATUS = {
  LOADING: "loading",
  SIGNED_OUT: "signed-out",
  NEEDS_PROFILE_SETUP: "needs-profile-setup", // verified account, no profiles row yet
  PROFILE_ERROR: "profile-error", // session is kept, but profile could not be loaded
  PASSWORD_RECOVERY: "password-recovery",
  SIGNED_IN: "signed-in",
};
export { STATUS };

function createProfileTimeoutError() {
  const error = new Error("Profile load timed out");
  error.name = "ProfileLoadTimeoutError";
  return error;
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(STATUS.LOADING);
  const [currentUser, setCurrentUser] = useState(null);
  // Held during NEEDS_PROFILE_SETUP so the profile-setup screen has
  // something to work with — a verified account but no profile row means
  // there's no `currentUser` shape yet.
  const [pendingAccount, setPendingAccount] = useState(null);
  const handlingRecoveryRef = useRef(false);

  async function resolveSessionUser(sessionUser) {
    let profileResult;
    let timeoutId;

    try {
      profileResult = await Promise.race([
        getProfile(sessionUser.id),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(createProfileTimeoutError()), PROFILE_LOAD_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      console.error("Profile load failed:", error);
      setCurrentUser(null);
      setPendingAccount(null);
      setStatus(STATUS.PROFILE_ERROR);
      return STATUS.PROFILE_ERROR;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const { profile, error } = profileResult;

    if (error) {
      console.error("Profile load failed:", error);
      setCurrentUser(null);
      setPendingAccount(null);
      setStatus(STATUS.PROFILE_ERROR);
      return STATUS.PROFILE_ERROR;
    }

    if (!profile) {
      // Signed in but no profile row — they verified their email OTP and
      // closed the app before finishing Step 3 (or profile creation failed).
      setCurrentUser(null);
      setPendingAccount({
        id: sessionUser.id,
        email: sessionUser.email,
        username: sessionUser.user_metadata?.username || "",
      });
      setStatus(STATUS.NEEDS_PROFILE_SETUP);
      return STATUS.NEEDS_PROFILE_SETUP;
    }

    setCurrentUser(personFromProfileRow(profile));
    setPendingAccount(null);
    setStatus(STATUS.SIGNED_IN);
    return STATUS.SIGNED_IN;
  }

  async function refreshAuth() {
    setStatus(STATUS.LOADING);

    const { data, error } = await getSession();

    if (handlingRecoveryRef.current) return;

    if (error) {
      console.error("Session refresh failed:", error);
      setCurrentUser(null);
      setPendingAccount(null);
      setStatus(STATUS.PROFILE_ERROR);
      return;
    }

    const session = data && data.session;
    if (!session) {
      setCurrentUser(null);
      setPendingAccount(null);
      setStatus(STATUS.SIGNED_OUT);
      return;
    }

    await resolveSessionUser(session.user);
  }

  useEffect(() => {
    const { data: sub } = onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        handlingRecoveryRef.current = true;
        setStatus(STATUS.PASSWORD_RECOVERY);
      }
    });

    refreshAuth();

    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const { data, error } = await signInWithPassword({ email, password });
    if (error) throw new Error(classifyAuthError(error));

    const resolvedStatus = await resolveSessionUser(data.user);
    return resolvedStatus === STATUS.SIGNED_IN;
  }

  async function logout() {
    await supabaseSignOut();
    setCurrentUser(null);
    setPendingAccount(null);
    setStatus(STATUS.SIGNED_OUT);
  }

  // Called once Step 3 (profile setup) actually creates the profiles row —
  // covers both a brand-new signup and someone resuming an interrupted one.
  function completeSignIn(profileRow) {
    setCurrentUser(personFromProfileRow(profileRow));
    setPendingAccount(null);
    setStatus(STATUS.SIGNED_IN);
  }

  // After a password reset, Supabase's recovery session IS a real signed-in
  // session — reuse the same resolver instead of forcing another login.
  async function completeRecovery() {
    const { data } = await getSession();
    if (data?.session?.user) await resolveSessionUser(data.session.user);
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        currentUser,
        pendingAccount,
        login,
        logout,
        completeSignIn,
        completeRecovery,
        refreshAuth,
        setCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
