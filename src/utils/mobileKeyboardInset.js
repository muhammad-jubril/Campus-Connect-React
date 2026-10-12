/**
 * Raise a mobile composer/modal above the on-screen keyboard when the visual
 * viewport shrinks. Targets should contain the focused input/textarea.
 * Returns a cleanup function and gracefully no-ops in older browsers.
 */
export function attachMobileKeyboardInset(target) {
  if (!target || typeof window === "undefined" || !window.visualViewport) {
    return () => {};
  }

  const viewport = window.visualViewport;
  let frame = 0;

  const updateInset = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      if (!target.isConnected) return;

      const isMobile = window.matchMedia?.("(max-width: 767px)")?.matches;
      const ownsFocus = target.contains(document.activeElement);
      const keyboardLikelyOpen = ownsFocus && viewport.height < window.innerHeight * 0.82;
      const inset = isMobile && keyboardLikelyOpen
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;

      target.style.setProperty("--cc-mobile-keyboard-inset", `${inset}px`);
    });
  };

  viewport.addEventListener("resize", updateInset);
  viewport.addEventListener("scroll", updateInset);
  window.addEventListener("resize", updateInset);
  document.addEventListener("focusin", updateInset);
  document.addEventListener("focusout", updateInset);
  updateInset();

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    viewport.removeEventListener("resize", updateInset);
    viewport.removeEventListener("scroll", updateInset);
    window.removeEventListener("resize", updateInset);
    document.removeEventListener("focusin", updateInset);
    document.removeEventListener("focusout", updateInset);
    target.style.removeProperty("--cc-mobile-keyboard-inset");
  };
}
