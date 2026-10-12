import { useEffect, useId, useRef, useState } from "react";
import { REPORT_REASONS, MAX_CONTENT_REPORT_DETAILS, validateContentReportDraft } from "../../utils/contentSafetyRules";
import { submitContentReport } from "../../services/supabase/contentSafety";
import { useToast } from "../../hooks/useToast";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ReportDialog({ open, onClose, returnFocusRef = null, targetType, targetId, targetLabel = "this item" }) {
  const [reason, setReason] = useState(REPORT_REASONS[targetType]?.[0]?.value || "other");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const busyRef = useRef(false);
  const reasonRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const { showToast } = useToast();
  const reasons = REPORT_REASONS[targetType] || REPORT_REASONS.post;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const frame = window.requestAnimationFrame(() => reasonRef.current?.focus());
    function onKeyDown(event) {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const panel = document.getElementById(titleId)?.closest(".content-report-dialog");
      if (!panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      const focusTarget = returnFocusRef?.current || previous;
      if (focusTarget?.isConnected) window.requestAnimationFrame(() => focusTarget.focus?.());
    };
  }, [open, onClose, returnFocusRef, titleId]);

  useEffect(() => {
    if (!open) return;
    setReason(REPORT_REASONS[targetType]?.[0]?.value || "other");
    setDetails("");
    setSubmitted(false);
    setErrorMessage("");
  }, [open, targetType, targetId]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busyRef.current || submitted) return;
    setErrorMessage("");
    try {
      validateContentReportDraft({ targetType, reason, details });
    } catch (validationError) {
      setErrorMessage(validationError.message);
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    try {
      await submitContentReport({ targetType, targetId, reason, details });
      setSubmitted(true);
      showToast("Report submitted for review");
    } catch (submitError) {
      console.error("Content report submission failed:", submitError);
      setErrorMessage(submitError.message || "Couldn't submit the report. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-overlay show" onClick={(event) => { event.stopPropagation(); if (!submitting && event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card content-report-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 520px)", maxHeight: "min(88dvh, 720px)", overflowY: "auto" }}>
        <h2 id={titleId} className="display" style={{ fontSize: 21, marginBottom: 6 }}>{submitted ? "Report received" : `Report ${targetLabel}`}</h2>
        <p id={descriptionId} className="modal-sub" style={{ marginBottom: 18 }}>{submitted ? "Your report was saved successfully and is available to authorised moderators for review." : "Reports are private. Choose the reason that best describes your concern."}</p>
        {submitted ? (
          <div className="post-composer-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor={`${titleId}-reason`}>Reason</label>
              <select ref={reasonRef} id={`${titleId}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} disabled={submitting} required>
                {reasons.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${titleId}-details`}>Additional details (optional)</label>
              <textarea id={`${titleId}-details`} value={details} onChange={(event) => setDetails(event.target.value)} maxLength={MAX_CONTENT_REPORT_DETAILS} rows={4} disabled={submitting} placeholder="Add context that will help a moderator review this report." />
              <div className="post-char-count">{details.length}/{MAX_CONTENT_REPORT_DETAILS}</div>
            </div>
            {errorMessage && <p role="alert" className="marketplace-field-error" style={{ marginBottom: 12 }}>{errorMessage}</p>}
            <div className="post-composer-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Submitting…" : "Submit report"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
