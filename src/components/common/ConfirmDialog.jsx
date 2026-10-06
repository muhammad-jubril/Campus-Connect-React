import { useEffect, useId, useRef } from "react";

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
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => cancelRef.current?.focus());

    return () => {
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
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="display" style={{ fontSize: 20, marginBottom: 6 }}>{title}</h3>
        <p id={messageId} className="modal-sub" style={{ marginBottom: 20 }}>{message}</p>
        <div className="post-composer-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
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
