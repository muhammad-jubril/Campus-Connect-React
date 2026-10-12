import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import "../../styles/pwa-update-prompt.css";

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function UpdateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 7v5h-5" />
      <path d="M4.9 9a7.5 7.5 0 0 1 12.6-2L20 12M4 17v-5h5" />
      <path d="M19.1 15a7.5 7.5 0 0 1-12.6 2L4 12" />
    </svg>
  );
}

export default function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [isDeferred, setIsDeferred] = useState(false);
  const refreshButtonRef = useRef(null);
  const reminderButtonRef = useRef(null);
  const checkingRef = useRef(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_serviceWorkerUrl, serviceWorkerRegistration) {
      setRegistration(serviceWorkerRegistration || null);
    },
    onRegisterError(error) {
      // Update prompts are best-effort. Do not interrupt app usage if registration fails.
      console.error("Campus Connect service worker registration failed:", error);
    },
  });

  useEffect(() => {
    if (!registration) return undefined;

    let disposed = false;
    const checkForUpdate = async () => {
      if (disposed || checkingRef.current || !navigator.onLine || document.visibilityState === "hidden") return;
      checkingRef.current = true;
      try {
        await registration.update();
      } catch (error) {
        // A transient update check should never break the running app.
        console.warn("Campus Connect update check failed:", error);
      } finally {
        checkingRef.current = false;
      }
    };

    // Browsers check for updates during registration/navigation too. These
    // foreground checks also catch deployments while the app stays open.
    const intervalId = window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    const handleOnline = () => void checkForUpdate();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [registration]);

  useEffect(() => {
    if (needRefresh) {
      setIsDeferred(false);
      setUpdateError("");
    }
  }, [needRefresh]);

  useEffect(() => {
    if (!needRefresh) return;
    if (isDeferred) reminderButtonRef.current?.focus();
    else refreshButtonRef.current?.focus();
  }, [needRefresh, isDeferred]);

  async function handleRefresh() {
    if (isUpdating) return;
    setIsUpdating(true);
    setUpdateError("");
    try {
      // In prompt mode this asks the waiting worker to activate, then reloads
      // the page onto the newly deployed assets. No second worker is registered.
      await updateServiceWorker(true);
    } catch (error) {
      console.error("Campus Connect could not activate the available update:", error);
      setIsUpdating(false);
      setUpdateError("The update could not be applied right now. Check your connection and try again.");
    }
  }

  function handleLater() {
    setIsDeferred(true);
  }

  function handleDialogKeyDown(event) {
    if (event.key === "Escape" && !isUpdating) {
      event.preventDefault();
      handleLater();
      return;
    }

    if (event.key !== "Tab") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll("button:not(:disabled)"));
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!needRefresh) return null;

  if (isDeferred) {
    return (
      <aside className="pwa-update-reminder" role="status" aria-live="polite">
        <span className="pwa-update-reminder-copy">
          <strong>Update ready</strong>
          <span>A newer version of Campus Connect is available.</span>
        </span>
        <button
          type="button"
          className="pwa-update-button pwa-update-button--primary pwa-update-reminder-refresh"
          onClick={() => void handleRefresh()}
          disabled={isUpdating}
        >
          {isUpdating ? "Updating…" : "Refresh"}
        </button>
        <button
          type="button"
          className="pwa-update-reminder-details"
          onClick={() => setIsDeferred(false)}
          aria-label="Show update details"
          ref={reminderButtonRef}
        >
          Details
        </button>
      </aside>
    );
  }

  return (
    <div className="pwa-update-overlay">
      <section
        className="pwa-update-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pwa-update-title"
        aria-describedby="pwa-update-description"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="pwa-update-mark"><UpdateIcon /></div>
        <p className="pwa-update-eyebrow">CAMPUS CONNECT</p>
        <h2 id="pwa-update-title">A new version is ready</h2>
        <p id="pwa-update-description" className="pwa-update-description">
          We’ve made improvements to Campus Connect. Refresh now to get the latest version.
        </p>
        {updateError && <p className="pwa-update-error" role="alert">{updateError}</p>}
        <button
          type="button"
          className="pwa-update-button pwa-update-button--primary pwa-update-refresh"
          onClick={() => void handleRefresh()}
          disabled={isUpdating}
          ref={refreshButtonRef}
        >
          {isUpdating ? "Updating Campus Connect…" : "Refresh now"}
        </button>
        <button
          type="button"
          className="pwa-update-button pwa-update-button--secondary"
          onClick={handleLater}
          disabled={isUpdating}
        >
          Not now
        </button>
        <p className="pwa-update-footnote">Your app will reload to finish updating.</p>
      </section>
    </div>
  );
}
