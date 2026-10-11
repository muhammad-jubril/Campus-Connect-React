// Single source of truth for "can this app be installed, and is it already?".
//
// WHY THIS IS A MODULE AND NOT COMPONENT STATE
// The browser fires `beforeinstallprompt` once, very early, and the event can
// only be used once. If a React component were the only listener, the event
// could be missed (component not mounted yet) or lost (component remounted).
// This module registers its listeners the moment it is imported (first import
// in main.jsx) and keeps the event until the user actually uses it.
//
// INSTALLED DETECTION (all of these feed one `installed` flag)
//  1. Running standalone / fullscreen / iOS home-screen launch.
//  2. The `appinstalled` event.
//  3. navigator.getInstalledRelatedApps() (needs related_applications in the
//     manifest, see vite.config.js).
//  4. A localStorage flag written by 1-3, so a plain browser tab that is
//     opened later still knows the app is installed.
//  The flag is cleared the moment the browser fires `beforeinstallprompt`,
//  because the browser only does that when the app is NOT installed. That
//  covers users who uninstalled the app later.

const INSTALLED_KEY = "cc:pwa-installed";
const IOS_HINT_DELAY_MS = 2500;
const INSTALLING_TIMEOUT_MS = 10000;

const listeners = new Set();
let deferredPrompt = null;

const state = {
  installed: false,
  installing: false, // user accepted the native dialog, waiting for `appinstalled`
  awaitingFreshEvent: false, // user cancelled; browser has not re-offered yet
  iosHintReady: false,
};

let snapshot = buildSnapshot();

function buildSnapshot() {
  return {
    installed: state.installed,
    installing: state.installing,
    awaitingFreshEvent: state.awaitingFreshEvent,
    canPrompt: Boolean(deferredPrompt),
    isIOS: detectIOS(),
    iosHintReady: state.iosHintReady,
  };
}

function commit(patch = {}) {
  Object.assign(state, patch);
  snapshot = buildSnapshot();
  listeners.forEach((listener) => listener());
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return snapshot;
}

function detectIOS() {
  if (typeof window === "undefined") return false;
  const { userAgent = "", platform = "", maxTouchPoints = 0 } = window.navigator;
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
      window.matchMedia?.("(display-mode: minimal-ui)")?.matches ||
      // iOS Safari exposes this non-standard flag for Home Screen launches.
      window.navigator?.standalone === true
  );
}

function readInstalledFlag() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeInstalledFlag(value) {
  try {
    if (value) localStorage.setItem(INSTALLED_KEY, "1");
    else localStorage.removeItem(INSTALLED_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

function markInstalled() {
  deferredPrompt = null;
  writeInstalledFlag(true);
  commit({ installed: true, installing: false, awaitingFreshEvent: false });
}

let installingTimer = null;

function startInstallingTimer() {
  window.clearTimeout(installingTimer);
  // Accepted does not guarantee the install finished (e.g. the user closes
  // the browser mid-install). If `appinstalled` never arrives, fall back to
  // the normal banner instead of showing "Installing..." forever.
  installingTimer = window.setTimeout(() => {
    if (!state.installed && state.installing) {
      commit({ installing: false, awaitingFreshEvent: !deferredPrompt });
    }
  }, INSTALLING_TIMEOUT_MS);
}

/**
 * Opens the browser's native install dialog. Must be called directly from a
 * click handler (browsers require a user gesture).
 * Returns "accepted" | "dismissed" | "unavailable".
 */
export async function promptInstall() {
  const promptEvent = deferredPrompt;
  if (!promptEvent) return "unavailable";

  // The event is single-use, so drop it now. The banner stays visible: only
  // a real install (appinstalled / standalone) is allowed to remove it.
  deferredPrompt = null;
  commit({});

  try {
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    if (choice?.outcome === "accepted") {
      commit({ installing: true, awaitingFreshEvent: false });
      startInstallingTimer();
      return "accepted";
    }

    commit({ awaitingFreshEvent: !deferredPrompt });
    return "dismissed";
  } catch (error) {
    console.warn("The native install prompt could not be opened:", error);
    commit({ awaitingFreshEvent: !deferredPrompt });
    return "dismissed";
  }
}

async function checkRelatedApps() {
  if (typeof navigator?.getInstalledRelatedApps !== "function") return;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    // If the browser already offered installation, the app is not installed.
    if (!deferredPrompt && apps.some((app) => app.platform === "webapp")) markInstalled();
  } catch {
    // Unsupported context (e.g. no related_applications in the manifest).
  }
}

function init() {
  if (typeof window === "undefined") return;

  // Start from what we remember, then correct it with live signals.
  if (isStandaloneDisplay()) {
    markInstalled();
  } else if (readInstalledFlag()) {
    commit({ installed: true });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    // Stop the browser's own mini-infobar; our banner replaces it.
    event.preventDefault();
    deferredPrompt = event;
    window.clearTimeout(installingTimer);
    // The browser only offers installation when the app is not installed.
    writeInstalledFlag(false);
    commit({ installed: false, installing: false, awaitingFreshEvent: false });
  });

  window.addEventListener("appinstalled", () => {
    window.clearTimeout(installingTimer);
    markInstalled();
  });

  const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
  const onDisplayModeChange = (event) => {
    if (event.matches) markInstalled();
  };
  if (standaloneQuery?.addEventListener) {
    standaloneQuery.addEventListener("change", onDisplayModeChange);
  } else {
    standaloneQuery?.addListener?.(onDisplayModeChange);
  }

  if (!isStandaloneDisplay()) checkRelatedApps();

  if (detectIOS() && !isStandaloneDisplay()) {
    window.setTimeout(() => commit({ iosHintReady: true }), IOS_HINT_DELAY_MS);
  }
}

init();
