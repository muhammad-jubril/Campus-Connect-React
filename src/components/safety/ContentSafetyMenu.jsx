import { useCallback, useEffect, useId, useRef, useState } from "react";
import ConfirmDialog from "../common/ConfirmDialog";
import ReportDialog from "./ReportDialog";
import { useAuth } from "../../hooks/useAuth";
import { usePosts } from "../../hooks/usePosts";
import { useToast } from "../../hooks/useToast";
import { blockUser, hidePost } from "../../services/supabase/contentSafety";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

const ITEM_STYLE = {
  display: "block", width: "100%", border: "none", borderRadius: 8,
  background: "transparent", padding: "9px 10px", textAlign: "left",
  font: "inherit", fontSize: 13, fontWeight: 600, color: "var(--ink)", cursor: "pointer",
};

export default function ContentSafetyMenu({
  targetType,
  targetId,
  reportedUserId,
  targetAuthorId,
  targetUsername = "",
  targetLabel,
  onBlocked,
  onHidden,
  canDeleteTarget = false,
  onDelete,
}) {
  const { currentUser } = useAuth();
  const { hidePostFromCache, hideUserPostsFromCache } = usePosts();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const menuId = useId();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const closeReportDialog = useCallback(() => setReportOpen(false), []);

  const authorId = targetAuthorId || reportedUserId;
  const isOwnTarget = Boolean(currentUser?.id && authorId === currentUser.id);
  const canHidePost = targetType === "post" && !isOwnTarget;
  const canReport = ["post", "account", "comment", "reply"].includes(targetType) && !isOwnTarget;
  const canBlock = Boolean(authorId && !isOwnTarget && authorId !== currentUser?.id);
  const canDelete = Boolean(canDeleteTarget && typeof onDelete === "function");

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); buttonRef.current?.focus(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = itemRefs.current.filter(Boolean);
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement);
      let next = current;
      if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
      if (event.key === "ArrowUp") next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
      items[next]?.focus();
    };
    const frame = window.requestAnimationFrame(() => itemRefs.current[0]?.focus());
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!currentUser || (!canReport && !canHidePost && !canBlock && !canDelete)) return null;

  function menuAction(action) {
    setOpen(false);
    if (action === "report") setReportOpen(true);
    if (action === "block") setBlockConfirmOpen(true);
    if (action === "hide") void handleHide();
    if (action === "delete") onDelete?.(buttonRef.current);
  }

  async function handleHide() {
    if (working) return;
    setWorking(true);
    try {
      await hidePost(targetId);
      hidePostFromCache(targetId);
      onHidden?.(targetId);
      showToast("Post hidden from your feed");
      if (location.pathname.startsWith("/post/")) {
        if (location.key === "default") navigate("/feed", { replace: true });
        else navigate(-1);
      }
    } catch (error) {
      console.error("Hide post failed:", error);
      showToast(error.message || "Couldn't hide this post. Try again.", "error");
    } finally {
      setWorking(false);
    }
  }

  async function handleBlock() {
    if (working || !authorId) return;
    setWorking(true);
    try {
      await blockUser(authorId);
      hideUserPostsFromCache(authorId);
      setBlockConfirmOpen(false);
      showToast(`Account${targetUsername ? ` @${targetUsername}` : ""} blocked. You won't see each other's content.`);
      onBlocked?.(authorId);
      if (targetType === "account") navigate("/feed", { replace: true });
      else if (targetType === "post" && location.pathname.startsWith("/post/")) {
        if (location.key === "default") navigate("/feed", { replace: true });
        else navigate(-1);
      }
    } catch (error) {
      console.error("Block account failed:", error);
      showToast(error.message || "Couldn't block this account. Try again.", "error");
    } finally {
      setWorking(false);
    }
  }

  const entries = [
    ...(canReport ? [{ label: `Report ${targetLabel || (targetType === "account" ? "account" : targetType)}`, action: "report" }] : []),
    ...(canHidePost ? [{ label: "Hide post", action: "hide" }] : []),
    ...(canBlock ? [{ label: `Block${targetUsername ? ` @${targetUsername}` : " author"}`, action: "block", danger: true }] : []),
    ...(canDelete ? [{ label: `Delete ${targetLabel || "item"}`, action: "delete", danger: true }] : []),
  ];

  return (
    <div ref={rootRef} className="content-safety-menu" style={{ position: "relative", flex: "0 0 auto" }} onClick={(event) => event.stopPropagation()}>
      <button ref={buttonRef} type="button" className="content-safety-trigger" aria-label="More content actions" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((previous) => !previous)} disabled={working} style={{ width: 32, height: 32, border: 0, borderRadius: "50%", background: open ? "rgba(28,27,23,0.08)" : "transparent", color: "rgba(28,27,23,0.55)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
      </button>
      {open && <div id={menuId} role="menu" aria-label="Content actions" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 80, minWidth: 168, padding: 6, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}>
        {entries.map((entry, index) => <button key={entry.action} ref={(element) => { itemRefs.current[index] = element; }} type="button" role="menuitem" tabIndex={-1} style={{ ...ITEM_STYLE, color: entry.danger ? "var(--accent-red)" : "var(--ink)" }} onClick={() => menuAction(entry.action)}>{entry.label}</button>)}
      </div>}
      {reportOpen && createPortal(<ReportDialog open onClose={closeReportDialog} returnFocusRef={buttonRef} targetType={targetType} targetId={targetId} targetLabel={targetLabel || (targetType === "account" ? "account" : targetType)} />, document.body)}
      {blockConfirmOpen && createPortal(<ConfirmDialog open title="Block this account?" message="You and this person will no longer see each other's posts, profiles, comments, or Marketplace listings. New comments and likes between you will be restricted. You can unblock them later from Blocked accounts." confirmLabel="Block account" cancelLabel="Cancel" busy={working} onCancel={() => setBlockConfirmOpen(false)} onConfirm={handleBlock} returnFocusRef={buttonRef} />, document.body)}
    </div>
  );
}
