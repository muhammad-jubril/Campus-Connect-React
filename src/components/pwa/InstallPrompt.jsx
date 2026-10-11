import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import "../../styles/pwa-install-prompt.css";

// A beforeinstallprompt event is one-use. Keep the banner visible after the
// user dismisses the native dialog, but wait for a fresh event before trying
// to open that dialog again.
let pendingInstallPrompt = null;
let installOpportunitySeen = false;
const installPromptSubscribers = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingInstallPrompt = event;
    installOpportunitySeen = true;
    installPromptSubscribers.forEach((subscriber) => subscriber({ type: "available", event }));
  });

  window.addEventListener("appinstalled", () => {
    pendingInstallPrompt = null;
    installOpportunitySeen = false;
    installPromptSubscribers.forEach((subscriber) => subscriber({ type: "installed" }));
  });
}

function isStandalonePwa() {
  if (typeof window === "undefined") return false;

  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
      // iOS Safari exposes this non-standard flag for Home Screen launches.
      window.navigator?.standalone === true
  );
}

function isIOSDevice() {
  if (typeof window === "undefined") return false;
  const { userAgent = "", platform = "", maxTouchPoints = 0 } = window.navigator;
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

async function isInstalledRelatedPwa() {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.getInstalledRelatedApps !== "function"
  ) {
    return false;
  }

  try {
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some((app) => app.platform === "webapp");
  } catch {
    return false;
  }
}

function blurBannerFocusBeforeHide() {
  if (typeof document === "undefined") return;
  const activeElement = document.activeElement;
  if (activeElement?.closest?.(".pwa-install-prompt")) activeElement.blur();
}

export default function InstallPrompt() {
  const [isInstalled, setIsInstalled] = useState(() => isStandalonePwa());
  const [isDismissed, setIsDismissed] = useState(false);
  const [showBanner, setShowBanner] = useState(() => installOpportunitySeen);
  const [installEvent, setInstallEvent] = useState(() => pendingInstallPrompt);
  const [isPromptPending, setIsPromptPending] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isIOS] = useState(() => isIOSDevice());
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    const previousPathname = previousPath.current;
    previousPath.current = location.pathname;

    // A manual close is temporary. Offer the prompt again after signup/login
    // completes and the user enters the app's welcome/feed screen.
    if (
      previousPathname !== location.pathname &&
      ["/welcome", "/feed"].includes(location.pathname)
    ) {
      setIsDismissed(false);
      if (installOpportunitySeen || pendingInstallPrompt) {
        setShowBanner(true);
        setInstallEvent(pendingInstallPrompt);
      }
      if (isIOS) setShowIOSPrompt(true);
    }
  }, [isIOS, location.pathname]);

  useEffect(() => {
    let cancelled = false;

    function completeInstalledState() {
      blurBannerFocusBeforeHide();
      pendingInstallPrompt = null;
      installOpportunitySeen = false;
      setInstallEvent(null);
      setShowBanner(false);
      setShowIOSPrompt(false);
      setIsDismissed(false);
      setIsPromptPending(false);
      setIsInstalled(true);
    }

    function receivePromptMessage(message) {
      if (message.type === "available") {
        setInstallEvent(message.event);
        setShowBanner(true);
        setIsDismissed(false);
        setIsPromptPending(false);
      } else if (message.type === "installed") {
        completeInstalledState();
      }
    }

    installPromptSubscribers.add(receivePromptMessage);
    if (pendingInstallPrompt) {
      setInstallEvent(pendingInstallPrompt);
      setShowBanner(true);
    }

    function handleAppInstalled() {
      completeInstalledState();
    }

    function handleDisplayModeChange(event) {
      if (event.matches || isStandalonePwa()) completeInstalledState();
    }

    window.addEventListener("appinstalled", handleAppInstalled);

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    if (standaloneQuery?.addEventListener) {
      standaloneQuery.addEventListener("change", handleDisplayModeChange);
    } else {
      standaloneQuery?.addListener?.(handleDisplayModeChange);
    }

    if (isStandalonePwa()) {
      completeInstalledState();
    } else {
      isInstalledRelatedPwa().then((installed) => {
        if (!cancelled && installed) completeInstalledState();
      });

      // iOS Safari doesn't expose beforeinstallprompt. Match the vanilla
      // version by showing its Share -> Add to Home Screen hint after a delay.
      if (isIOS) {
        const timerId = window.setTimeout(() => setShowIOSPrompt(true), 2500);
        return () => {
          cancelled = true;
          window.clearTimeout(timerId);
          installPromptSubscribers.delete(receivePromptMessage);
          window.removeEventListener("appinstalled", handleAppInstalled);
          if (standaloneQuery?.removeEventListener) {
            standaloneQuery.removeEventListener("change", handleDisplayModeChange);
          } else {
            standaloneQuery?.removeListener?.(handleDisplayModeChange);
          }
        };
      }
    }

    return () => {
      cancelled = true;
      installPromptSubscribers.delete(receivePromptMessage);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (standaloneQuery?.removeEventListener) {
        standaloneQuery.removeEventListener("change", handleDisplayModeChange);
      } else {
        standaloneQuery?.removeListener?.(handleDisplayModeChange);
      }
    };
  }, [isIOS]);

  async function handleInstall() {
    const promptEvent = installEvent || pendingInstallPrompt;
    if (!promptEvent || isPromptPending) return;

    // The browser's prompt event can only be used once. Clear the available
    // event immediately; do NOT hide the banner here. Only appinstalled (or
    // confirmed standalone mode) should make the banner disappear.
    pendingInstallPrompt = null;
    setInstallEvent(null);
    setIsPromptPending(true);

    try {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice?.outcome === "dismissed") {
        // Keep the banner visible. A fresh beforeinstallprompt event is needed
        // before another native installation dialog can be opened.
        setShowBanner(true);
      }
      // Accepted is not proof the install completed. Wait for appinstalled.
    } catch (error) {
      // Keep the prompt visible instead of replacing it with manual instructions.
      console.warn("The native PWA install prompt could not be opened:", error);
    } finally {
      setIsPromptPending(false);
    }
  }

  function handleDismiss() {
    // Avoid transferring focus from the removed banner button to the welcome
    // page's first CTA, which can create a misleading dark focus border.
    blurBannerFocusBeforeHide();
    setIsDismissed(true);
    setShowBanner(false);
    setShowIOSPrompt(false);
  }

  if (isInstalled || isDismissed) return null;

  if (showBanner) {
    return (
      <aside className="pwa-install-prompt" aria-label="Install Campus Connect">
        <img className="pwa-install-icon" src="/campus-connect-logo.png" alt="" />
        <div className="pwa-install-copy">
          <strong>Install Campus Connect</strong>
          <p>Add it to your home screen for the full app experience.</p>
        </div>
        <button
          type="button"
          className="pwa-install-action"
          onClick={handleInstall}
          disabled={!installEvent || isPromptPending}
          title={!installEvent ? "Waiting for the browser to offer installation again" : undefined}
        >
          Install
        </button>
        <button
          type="button"
          className="pwa-install-dismiss"
          aria-label="Dismiss install prompt"
          onClick={handleDismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
      </aside>
    );
  }

  // On iOS Safari the browser doesn't provide a programmatic installation API.
  if (isIOS && showIOSPrompt) {
    return (
      <aside className="pwa-install-prompt pwa-install-prompt--ios" aria-label="Add Campus Connect to Home Screen">
        <img className="pwa-install-icon" src="/campus-connect-logo.png" alt="" />
        <div className="pwa-install-copy">
          <strong>Install Campus Connect</strong>
          <p>Tap Share, then “Add to Home Screen”.</p>
        </div>
        <button
          type="button"
          className="pwa-install-dismiss"
          aria-label="Dismiss install prompt"
          onClick={handleDismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
      </aside>
    );
  }

  return null;
}
