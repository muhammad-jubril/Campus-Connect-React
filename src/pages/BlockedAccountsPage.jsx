import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../hooks/useToast";
import { usePosts } from "../hooks/usePosts";
import { listMyBlockedAccounts, unblockUser } from "../services/supabase/contentSafety";

export default function BlockedAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const { showToast } = useToast();
  const { invalidatePostsCache } = usePosts();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setAccounts(await listMyBlockedAccounts()); }
    catch (loadError) {
      console.error("Blocked accounts failed to load:", loadError);
      setError(loadError.message || "Couldn't load blocked accounts.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleUnblock(account) {
    if (busyId) return;
    setBusyId(account.blocked_id);
    try {
      await unblockUser(account.blocked_id);
      invalidatePostsCache();
      setAccounts((previous) => previous.filter((item) => item.blocked_id !== account.blocked_id));
      showToast(`@${account.username || "account"} unblocked`);
    } catch (unblockError) {
      console.error("Unblock account failed:", unblockError);
      showToast(unblockError.message || "Couldn't unblock this account.", "error");
    } finally { setBusyId(null); }
  }

  return (
    <section className="content-safety-page">
      <span className="eyebrow">PRIVACY</span>
      <h1 className="display" style={{ marginBottom: 8 }}>Blocked accounts</h1>
      <p className="subtitle">Accounts you block cannot see your ordinary content, and you won't see theirs. Unblocking removes only your block; if they also blocked you, the restriction remains.</p>
      {loading ? <p className="subtitle" role="status">Loading blocked accounts…</p>
        : error ? <div role="alert" className="empty-state"><p>{error}</p><button type="button" className="btn btn-primary" onClick={load} style={{ width: "auto" }}>Try again</button></div>
          : accounts.length === 0 ? <div className="empty-state"><p className="subtitle">You haven't blocked anyone.</p><Link className="btn btn-ghost" to="/profile">Back to profile</Link></div>
            : <div className="blocked-account-list">{accounts.map((account) => <article key={account.blocked_id} className="blocked-account-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--line)" }}><div style={{ flex: 1, minWidth: 0 }}><strong>{account.name || account.username || "Campus Connect account"}</strong><div className="subtitle">@{account.username || "unknown"}</div></div><button type="button" className="btn btn-ghost" style={{ width: "auto", flex: "0 0 auto" }} onClick={() => handleUnblock(account)} disabled={busyId !== null}>{busyId === account.blocked_id ? "Unblocking…" : "Unblock"}</button></article>)}</div>}
    </section>
  );
}
