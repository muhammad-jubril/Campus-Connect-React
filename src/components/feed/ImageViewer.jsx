import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../../styles/image-viewer.css";

export default function ImageViewer({ src, alt, onClose, triggerElement }) {
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const body = document.body;
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const previousFocus = triggerElement || document.activeElement;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    // Preserve the feed's scroll position on both desktop and mobile while the
    // full-screen viewer is open. Restore the exact inline styles on dismissal.
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    closeButtonRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
      } else if (event.key === "Tab") {
        // The close button is the only control in the dialog. Keep focus within
        // the modal rather than allowing keyboard focus to disappear behind it.
        event.preventDefault();
        closeButtonRef.current?.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      Object.assign(body.style, previousBodyStyles);
      window.scrollTo(scrollX, scrollY);
      if (previousFocus?.isConnected && typeof previousFocus.focus === "function") {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [triggerElement]);

  if (!src) return null;

  return createPortal(
    <div className="image-viewer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="image-viewer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
        tabIndex={-1}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="image-viewer-close"
          onClick={onClose}
          aria-label="Close image preview"
          title="Close preview (Esc)"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m18 6-12 12M6 6l12 12" />
          </svg>
        </button>
        <img className="image-viewer-image" src={src} alt={alt || "Expanded post image"} draggable="false" />
      </div>
    </div>,
    document.body,
  );
}
