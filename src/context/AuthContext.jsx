import { createContext, useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabase/client";
import {
  signInWithPassword, signOut as supabaseSignOut, getSession, getUser, onAuthStateChange,
} from "../services/supabase/auth";
import { getProfile, personFromProfileRow } from "../services/supabase/profiles";

export const AuthContext = createContext(null);

// Every possible state the app can be in regarding "who is this and are
// they fully set up" — the routes react to this rather than each doing
// their own ad-hoc session checks.
const STATUS = {
  LOADING: "loading",
  SIGNED_OUT: "signed-out",
  NEEDS_PROFILE_SETUP: "needs-profile-setup", // verified account, no profiles row yet
  PASSWORD_RECOVERY: "password-recovery",
  SIGNED_IN: "signed-in",
};
export { STATUS };

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(STATUS.LOADING);
  const [currentUser, setCurrentUser] = useState(null);
  // Held during NEEDS_PROFILE_SETUP so the profile-setup screen has
  // something to work with — a verified account but no profile row means
  // there's no `currentUser` shape yet.
  const [pendingAccount, setPendingAccount] = useState(null);
  const handlingRecoveryRef = useRef(false);

  async function resolveSessionUser(sessionUser) {
    const { profile, error } = await getProfile(sessionUser.id);
    if (error || !profile) {
      // Signed in but no profile row — they verified their email OTP and
      // closed the app before finishing signup Step 3 (or, on login,
      // their password IS correct — this is not a wrong-credentials case).
      const { data: userData } = await getUser();
      const user = userData && userData.user;
      setPendingAccount({
        id: sessionUser.id,
        email: sessionUser.email,
        username: (user && user.user_metadata && user.user_metadata.username) || "",
      });
      setStatus(STATUS.NEEDS_PROFILE_SETUP);
      return;
    }
    setCurrentUser(personFromProfileRow(profile));
    setStatus(STATUS.SIGNED_IN);
  }

  useEffect(() => {
    const { data: sub } = onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        handlingRecoveryRef.current = true;
        setStatus(STATUS.PASSWORD_RECOVERY);
      }
    });

    (async () => {
      const { data } = await getSession();
      const session = data && data.session;
      if (handlingRecoveryRef.current) return; // don't clobber a recovery landing
      if (!session) {
        setStatus(STATUS.SIGNED_OUT);
        return;
      }
      await resolveSessionUser(session.user);
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const { data, error } = await signInWithPassword({ email, password });
    if (error) throw new Error("wrong-credentials");
    await resolveSessionUser(data.user);
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
    const { data } = await supabase.auth.getUser();
    if (data && data.user) await resolveSessionUser(data.user);
  }

  return (
    <AuthContext.Provider
      value={{ status, currentUser, pendingAccount, login, logout, completeSignIn, completeRecovery, setCurrentUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}
