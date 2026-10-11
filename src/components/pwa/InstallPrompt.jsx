import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { getSnapshot, promptInstall, subscribe } from "../../utils/pwaInstall";
import "../../styles/pwa-install-prompt.css";

const MANUAL_HINT =
  "Your browser will offer installation again in a moment. If nothing appears, open the browser menu and choose Install app.";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function blurBannerFocusBeforeHide() {
  const active = document.activeElement;
  if (active?.closest?.(".pwa-install-prompt")) active.blur();
}

export default function InstallPrompt() {
  const install = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const [hint, setHint] = useState("");
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  // The X is only a temporary "not now". Bring the banner back when the user
  // lands in the app after signup/login (and it returns on every fresh visit).
  useEffect(() => {
    const before = previousPath.current;
    previousPath.current = location.pathname;
    if (before !== location.pathname && ["/welcome", "/feed"].includes(location.pathname)) {
      setDismissed(false);
    }
  }, [location.pathname]);

  // A fresh browser event makes the manual hint obsolete.
  useEffect(() => {
    if (install.canPrompt) setHint("");
  }, [install.canPrompt]);

  async function handleInstall() {
    if (install.installing) return;

    if (!install.canPrompt) {
      // Cancelled earlier and the browser has not re-offered yet. Keep the
      // banner and explain, rather than silently doing nothing.
      setHint(MANUAL_HINT);
      return;
    }

    setHint("");
    // prompt() is invoked synchronously inside this click, as browsers require.
    await promptInstall();
  }

  function handleDismiss() {
    blurBannerFocusBeforeHide();
    setDismissed(true);
  }

  // Already installed (or running as the installed app): never show.
  if (install.installed || dismissed) return null;

  const showNativeBanner = install.canPrompt || install.installing || install.awaitingFreshEvent;
  const showIOSBanner = !showNativeBanner && install.isIOS && install.iosHintReady;

  if (!showNativeBanner && !showIOSBanner) return null;

  return (
    <aside
      className={`pwa-install-prompt${showIOSBanner ? " pwa-install-prompt--ios" : ""}`}
      aria-label={showIOSBanner ? "Add Campus Connect to Home Screen" : "Install Campus Connect"}
    >
      <img className="pwa-install-icon" src="/campus-connect-logo.png" alt="" />
      <div className="pwa-install-copy">
        <strong>Install Campus Connect</strong>
        <p>
          {showIOSBanner
            ? "Tap Share, then \u201CAdd to Home Screen\u201D."
            : install.installing
              ? "Installing. This can take a few seconds."
              : "Add it to your home screen for the full app experience."}
        </p>
        {hint && !showIOSBanner && (
          <p className="pwa-install-hint" role="status">{hint}</p>
        )}
      </div>
      {!showIOSBanner && (
        <button
          type="button"
          className="pwa-install-action"
          onClick={handleInstall}
          disabled={install.installing}
        >
          {install.installing ? "Installing" : "Install"}
        </button>
      )}
      <button
        type="button"
        className="pwa-install-dismiss"
        aria-label="Dismiss install prompt"
        onClick={handleDismiss}
      >
        <CloseIcon />
      </button>
    </aside>
  );
}
