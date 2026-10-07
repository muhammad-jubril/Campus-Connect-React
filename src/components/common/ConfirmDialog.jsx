import { useEffect, useId, useRef } from "react";

const getFocusableElements = (container) => Array.from(container.querySelectorAll(
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
)).filter((element) => element.getAttribute("aria-hidden") !== "true");

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  returnFocusRef = null,
}) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const callbacksRef = useRef({ onCancel, busy });
  const titleId = useId();
  const messageId = useId();

  callbacksRef.current = { onCancel, busy };

  useEffect(() => {
    if (!open) return undefined;

    const activeElement = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !callbacksRef.current.busy) {
        event.preventDefault();
        callbacksRef.current.onCancel();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = getFocusableElements(dialogRef.current);

      if (focusables.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const focusTimer = window.requestAnimationFrame(() => {
      const target = cancelRef.current && !cancelRef.current.disabled
        ? cancelRef.current
        : getFocusableElements(dialogRef.current || document.body)[0];
      (target || dialogRef.current)?.focus();
    });

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      const target = returnFocusRef?.current || activeElement;
      if (target?.isConnected) {
        window.requestAnimationFrame(() => target.focus());
      }
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay show"
      onClick={(event) => {
        event.stopPropagation();
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="display" style={{ fontSize: 20, marginBottom: 6 }}>{title}</h3>
        <p id={messageId} className="modal-sub" style={{ marginBottom: 20 }}>{message}</p>
        <div className="post-composer-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" ref={cancelRef} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={busy}
            style={{ width: "auto", background: "var(--accent-red)" }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
