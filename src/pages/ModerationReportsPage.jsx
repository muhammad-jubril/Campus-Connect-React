import { useCallback, useEffect, useState } from "react";
import { isContentModerator, listContentReports, reviewContentReport } from "../services/supabase/contentSafety";
import { useToast } from "../hooks/useToast";

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ["pending", "under_review", "actioned", "dismissed"];

export default function ModerationReportsPage() {
  const [authorized, setAuthorized] = useState(null);
  const [status, setStatus] = useState("pending");
  const [reports, setReports] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const { showToast } = useToast();

  const load = useCallback(async (nextOffset = 0, append = false) => {
    setLoading(true);
    setError("");
    try {
      const allowed = await isContentModerator();
      setAuthorized(allowed);
      if (!allowed) { setReports([]); setHasMore(false); return; }
      const rows = await listContentReports({ status: status || null, offset: nextOffset, limit: PAGE_SIZE });
      setReports((previous) => append ? [...previous, ...rows] : rows);
      setOffset(nextOffset);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (loadError) {
      console.error("Moderation reports failed to load:", loadError);
      setError(loadError.message || "Couldn't load reports.");
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(0, false); }, [load]);

  async function handleReview(report, nextStatus) {
    const key = `${report.report_source}:${report.id}`;
    if (busyId) return;
    setBusyId(key);
    try {
      await reviewContentReport({ reportId: report.id, source: report.report_source, status: nextStatus, notes: notes[key] || "" });
      showToast("Moderation decision saved");
      await load(0, false);
    } catch (reviewError) {
      console.error("Report review failed:", reviewError);
      showToast(reviewError.message || "Couldn't save the moderation decision.", "error");
    } finally { setBusyId(null); }
  }

  async function loadMore() { await load(offset + PAGE_SIZE, true); }

  return (
    <section className="content-safety-page">
      <span className="eyebrow">RESTRICTED MODERATION</span>
      <h1 className="display" style={{ marginBottom: 8 }}>Content reports</h1>
      <p className="subtitle">Reports contain private information and are available only to accounts granted a moderator role in Supabase Auth app metadata.</p>
      {authorized === false ? <div className="empty-state" role="alert"><h2 className="display">Not authorised</h2><p className="subtitle">This account does not have permission to review reports.</p></div> : null}
      {error && <div role="alert" className="empty-state"><p>{error}</p><button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => load(0, false)}>Try again</button></div>}
      {authorized && <>
        <div className="field" style={{ maxWidth: 280 }}><label htmlFor="moderation-status">Report status</label><select id="moderation-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></div>
        {loading && reports.length === 0 ? <p className="subtitle" role="status">Loading reports…</p> : reports.length === 0 ? <div className="empty-state"><p className="subtitle">No reports in this queue.</p></div> : <div className="content-report-queue">{reports.map((report) => {
          const key = `${report.report_source}:${report.id}`;
          return <article key={key} className="content-report-review-card" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, margin: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{report.target_type.replaceAll("_", " ")} · {report.reason.replaceAll("_", " ")}</strong><span className="eyebrow">{report.status.replaceAll("_", " ")}</span></div>
            <p className="subtitle" style={{ margin: "8px 0" }}>Source: {report.report_source} · Target ID: {report.target_id} · Reporter ID: {report.reporter_id}</p>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{report.target_excerpt || "No text snapshot available."}</p>
            {(report.target_media_urls || []).map((url, index) => <img key={`${report.id}-media-${index}`} src={url} alt={`Reported post image ${index + 1}`} loading="lazy" decoding="async" style={{ display: "block", maxWidth: "min(100%, 320px)", maxHeight: 240, objectFit: "contain", borderRadius: 10, border: "1px solid var(--line)", margin: "8px 0" }} />)}
            {report.target_image_url && <img src={report.target_image_url} alt="Reported Marketplace listing image" loading="lazy" decoding="async" style={{ display: "block", maxWidth: "min(100%, 320px)", maxHeight: 240, objectFit: "contain", borderRadius: 10, border: "1px solid var(--line)", margin: "8px 0" }} />}
            {report.details && <blockquote style={{ borderLeft: "3px solid var(--line)", paddingLeft: 12, margin: "10px 0" }}>{report.details}</blockquote>}
            <label htmlFor={`notes-${key}`}>Private moderator notes</label>
            <textarea id={`notes-${key}`} rows={2} maxLength={1000} value={notes[key] || report.moderator_notes || ""} onChange={(event) => setNotes((previous) => ({ ...previous, [key]: event.target.value }))} placeholder="Optional notes for authorised moderators only." disabled={Boolean(busyId)} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 12 }}>
              {report.status === "pending" && <button type="button" className="btn btn-primary" style={{ width: "auto" }} disabled={Boolean(busyId)} onClick={() => handleReview(report, "under_review")}>{busyId === key ? "Saving…" : "Start review"}</button>}
              {report.status === "under_review" && <><button type="button" className="btn btn-ghost" style={{ width: "auto" }} disabled={Boolean(busyId)} onClick={() => handleReview(report, "dismissed")}>Dismiss</button><button type="button" className="btn btn-primary" style={{ width: "auto" }} disabled={Boolean(busyId)} onClick={() => handleReview(report, "actioned")}>{busyId === key ? "Saving…" : "Mark actioned"}</button></>}
              {(report.status === "actioned" || report.status === "dismissed") && <span className="subtitle">Reviewed {report.reviewed_at ? new Date(report.reviewed_at).toLocaleString() : ""}</span>}
            </div>
          </article>;
        })}</div>}
        {hasMore && <button type="button" className="btn btn-ghost" style={{ width: "auto" }} onClick={loadMore} disabled={loading}>{loading ? "Loading…" : "Load more reports"}</button>}
        {loading && reports.length > 0 && <p className="subtitle" role="status">Refreshing report queue…</p>}
      </>}
    </section>
  );
}
