import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const plan = new Map();
const ops = [];

function replaceOnce(file, before, after, description) {
  ops.push({ file, before, after, description });
}

replaceOnce(
  "src/hooks/usePosts.jsx",
  `  const removePost = useCallback(async (postId) => {\n    await postsApi.deletePost(postId);\n    setPosts((prev) => prev.filter((p) => p.id !== postId));\n  }, []);`,
  `  const removePost = useCallback(async (postId) => {\n    await postsApi.deletePost(postId);\n    setPosts((prev) => prev.filter((p) => p.id !== postId));\n  }, []);\n\n  // Update this shared cache only after a hide/block operation has succeeded\n  // on the backend. Pagination cursors are retained to avoid duplicate pages.\n  const hidePostFromCache = useCallback((postId) => {\n    // Reject stale responses from pages started before the successful hide.\n    loadRequestRef.current += 1;\n    loadMoreInFlightRef.current = false;\n    setLoadingMorePosts(false);\n    setLoadMoreError(null);\n    setPosts((previous) => previous.filter((post) => post.id !== postId));\n  }, []);\n\n  const hideUserPostsFromCache = useCallback((userId) => {\n    // Reject feed/profile requests started before the successful block.\n    loadRequestRef.current += 1;\n    loadMoreInFlightRef.current = false;\n    setLoadingMorePosts(false);\n    setLoadMoreError(null);\n    setPosts((previous) => previous.filter((post) => post.authorId !== userId));\n  }, []);\n\n  // Unblocking can make cached rows eligible again. Force a fresh feed load\n  // the next time FeedPage mounts, without changing scroll behavior otherwise.\n  const invalidatePostsCache = useCallback(() => {\n    // Invalidate in-flight reads too; the next feed/profile visit reloads\n    // data under the newly changed block relationship.\n    loadRequestRef.current += 1;\n    loadMoreInFlightRef.current = false;\n    setLoadingMorePosts(false);\n    setLoadMoreError(null);\n    loadedRef.current = false;\n    loadedScopeRef.current = null;\n  }, []);`,
  "Expose successful hide/block cache updates",
);
replaceOnce(
  "src/hooks/usePosts.jsx",
  "      removePost,\n      toggleLike,",
  "      removePost,\n      hidePostFromCache,\n      hideUserPostsFromCache,\n      invalidatePostsCache,\n      toggleLike,",
  "Expose hide/block cache helpers",
);

replaceOnce(
  "src/components/feed/PostCard.jsx",
  '          {isSelf && showPostMenu && <PostMenu post={post} onEdit={() => setEditing(true)} />}',
  '          {showPostMenu && <PostMenu post={post} onEdit={() => setEditing(true)} />}',
  "Render the post action menu for other users' posts too",
);

replaceOnce(
  "src/components/feed/PostMenu.jsx",
  'import ConfirmDialog from "../common/ConfirmDialog";\n',
  'import ConfirmDialog from "../common/ConfirmDialog";\nimport ContentSafetyMenu from "../safety/ContentSafetyMenu";\n',
  "Import reporting/hiding/blocking actions for non-owned posts",
);
replaceOnce(
  "src/components/feed/PostMenu.jsx",
  "  if (!isOwner) return null;",
  '  if (!isOwner) {\n    return (\n      <ContentSafetyMenu\n        targetType="post"\n        targetId={post.id}\n        reportedUserId={post.authorId}\n        targetAuthorId={post.authorId}\n        targetUsername={post.authorUsername}\n        targetLabel="post"\n      />\n    );\n  }',
  "Show report/hide/block for another user's post",
);

replaceOnce(
  "src/components/feed/CommentsModal.jsx",
  'import ConfirmDialog from "../common/ConfirmDialog";\n',
  'import ConfirmDialog from "../common/ConfirmDialog";\nimport ContentSafetyMenu from "../safety/ContentSafetyMenu";\n',
  "Import report/block menu in the comments modal",
);
replaceOnce(
  "src/components/feed/CommentsModal.jsx",
  `  function requestDelete(comment, event) {
    deleteTriggerRef.current = event.currentTarget;
    setPendingDelete(comment);
  }`,
  `  function requestDelete(comment, triggerElement) {
    deleteTriggerRef.current = triggerElement || inputRef.current;
    setPendingDelete(comment);
  }`,
  "Keep focus restoration when deletion is initiated from the shared action menu",
);
replaceOnce(
  "src/components/feed/CommentsModal.jsx",
  `                  {canDeleteComment(c) && (\n                    <button\n                      type="button"\n                      className="comments-modal-close"\n                      onClick={(event) => requestDelete(c, event)}\n                      aria-label="Delete comment"\n                      title="Delete comment"\n                      style={{ color: "var(--accent-red)", flexShrink: 0 }}\n                    >\n                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">\n                        <path d="M4 7h16" />\n                        <path d="M10 11v6M14 11v6" />\n                        <path d="M6 7l1 13h10l1-13" />\n                        <path d="M9 7V4h6v3" />\n                      </svg>\n                    </button>\n                  )}`,
  `                  <ContentSafetyMenu\n                    targetType="comment"\n                    targetId={c.id}\n                    reportedUserId={c.authorId}\n                    targetAuthorId={c.authorId}\n                    targetUsername={c.authorUsername}\n                    targetLabel="comment"\n                    canDeleteTarget={canDeleteComment(c)}\n                    onDelete={(triggerElement) => requestDelete(c, triggerElement)}\n                    onBlocked={(blockedUserId) => {\n                      const removedCount = (comments || []).filter((item) => item.authorId === blockedUserId).length;\n                      setComments((previous) => (previous || []).filter((item) => item.authorId !== blockedUserId));\n                      if (post?.authorId === blockedUserId) {\n                        onClose();\n                        return;\n                      }\n                      if (post?.id && removedCount > 0) bumpCommentCount(post.id, -removedCount);\n                    }}\n                  />`,
  "Use one comment action menu with report/block and confirmed deletion",
);

replaceOnce(
  "src/pages/PostDetailPage.jsx",
  'import Avatar from "../components/common/Avatar";\n',
  'import Avatar from "../components/common/Avatar";\nimport ContentSafetyMenu from "../components/safety/ContentSafetyMenu";\nimport ConfirmDialog from "../components/common/ConfirmDialog";\n',
  "Import reply safety actions and confirmed deletion",
);
replaceOnce(
  "src/pages/PostDetailPage.jsx",
  '  const [deletingCommentId, setDeletingCommentId] = useState(null);\n  const commentSectionRef = useRef(null);',
  '  const [deletingCommentId, setDeletingCommentId] = useState(null);\n  const [pendingDeleteComment, setPendingDeleteComment] = useState(null);\n  const deleteTriggerRef = useRef(null);\n  const commentSectionRef = useRef(null);',
  "Track the reply awaiting deletion confirmation",
);
replaceOnce(
  "src/pages/PostDetailPage.jsx",
  "            showPostMenu={false}",
  "            showPostMenu={visiblePost.authorId !== currentUser?.id}",
  "Expose report/hide/block on directly opened posts too",
);
replaceOnce(
  "src/pages/PostDetailPage.jsx",
  `                      {canDeleteComment(comment) && (\n                        <button\n                          type="button"\n                          className="post-detail-comment-delete"\n                          onClick={() => handleDeleteComment(comment)}\n                          disabled={deletingCommentId === comment.id}\n                          aria-label="Delete reply"\n                        >\n                          {deletingCommentId === comment.id ? "Deleting…" : "Delete"}\n                        </button>\n                      )}`,
  `                      <ContentSafetyMenu\n                        targetType="reply"\n                        targetId={comment.id}\n                        reportedUserId={comment.authorId}\n                        targetAuthorId={comment.authorId}\n                        targetUsername={comment.authorUsername}\n                        targetLabel="reply"\n                        canDeleteTarget={canDeleteComment(comment)}\n                        onDelete={(triggerElement) => handleDeleteComment(comment, triggerElement)}\n                        onBlocked={(blockedUserId) => {
                          const removedCount = (comments || []).filter((item) => item.authorId === blockedUserId).length;
                          setComments((previous) => (previous || []).filter((item) => item.authorId !== blockedUserId));
                          if (visiblePost?.authorId === blockedUserId) {
                            if (location.key === "default") navigate("/feed", { replace: true });
                            else navigate(-1);
                            return;
                          }
                          if (removedCount > 0) adjustCommentCount(-removedCount);
                        }}\n                      />`,
  "Use one reply action menu with report/block and confirmed deletion",
);
replaceOnce(
  "src/pages/PostDetailPage.jsx",
  `  async function handleDeleteComment(comment) {\n    if (deletingCommentId) return;\n    setDeletingCommentId(comment.id);\n\n    try {\n      await deleteComment(comment.id);\n      setComments((previous) => (previous || []).filter((item) => item.id !== comment.id));\n      adjustCommentCount(-1);\n      showToast("Reply deleted");\n    } catch (error) {\n      console.error("Delete post reply failed:", error);\n      showToast("Couldn't delete that reply — try again", "error");\n    } finally {\n      setDeletingCommentId(null);\n    }\n  }`,
  `  function handleDeleteComment(comment, triggerElement) {\n    if (deletingCommentId || !comment) return;\n    deleteTriggerRef.current = triggerElement || commentInputRef.current;\n    setPendingDeleteComment(comment);\n  }\n\n  async function confirmDeleteComment() {\n    const comment = pendingDeleteComment;\n    if (!comment || deletingCommentId) return;\n    setDeletingCommentId(comment.id);\n\n    try {\n      await deleteComment(comment.id);\n      setComments((previous) => (previous || []).filter((item) => item.id !== comment.id));\n      adjustCommentCount(-1);\n      showToast("Reply deleted");\n      deleteTriggerRef.current = commentInputRef.current;\n      setPendingDeleteComment(null);\n    } catch (error) {\n      console.error("Delete post reply failed:", error);\n      showToast("Couldn't delete that reply — try again", "error");\n    } finally {\n      setDeletingCommentId(null);\n    }\n  }`,
  "Require confirmation before permanently deleting a reply",
);
replaceOnce(
  "src/pages/PostDetailPage.jsx",
  `    </div>\n  );\n}\n`,
  `      <ConfirmDialog\n        open={!!pendingDeleteComment}\n        title="Delete reply?"\n        message="This will permanently remove the reply. Its moderation report, if any, will be retained."\n        confirmLabel="Delete reply"\n        cancelLabel="Cancel"\n        busy={Boolean(deletingCommentId)}\n        onCancel={() => setPendingDeleteComment(null)}\n        onConfirm={confirmDeleteComment}\n        returnFocusRef={deleteTriggerRef}\n      />\n    </div>\n  );\n}\n`,
  "Render the accessible reply deletion confirmation dialog",
);

replaceOnce(
  "src/pages/ProfilePage.jsx",
  'import PostCard from "../components/feed/PostCard";\n',
  'import PostCard from "../components/feed/PostCard";\nimport ContentSafetyMenu from "../components/safety/ContentSafetyMenu";\n',
  "Import profile reporting/blocking actions",
);
replaceOnce(
  "src/pages/ProfilePage.jsx",
  `            {isOwnProfile && (\n              <button\n                type="button"\n                className="profile-edit-btn"\n                onClick={() => navigate("/profile/edit")}\n              >\n                Edit profile\n              </button>\n            )}`, 
  `            {isOwnProfile && (\n              <button\n                type="button"\n                className="profile-edit-btn"\n                onClick={() => navigate("/profile/edit")}\n              >\n                Edit profile\n              </button>\n            )}\n            {isOwnProfile && (\n              <button\n                type="button"\n                className="profile-edit-btn"\n                onClick={() => navigate("/blocked-accounts")}\n              >\n                Blocked accounts\n              </button>\n            )}`,
  "Add an accessible route to manage blocked accounts",
);
replaceOnce(
  "src/pages/ProfilePage.jsx",
  `              {isOwnProfile && (
                <button
                  type="button"
                  className="profile-edit-icon"
                  onClick={() => navigate("/profile/edit")}
                  aria-label="Edit profile"
                  title="Edit profile"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                  </svg>
                </button>
              )}`,
  `              {isOwnProfile && (
                <button
                  type="button"
                  className="profile-edit-icon"
                  onClick={() => navigate("/profile/edit")}
                  aria-label="Edit profile"
                  title="Edit profile"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                  </svg>
                </button>
              )}
              {!isOwnProfile && (
                <ContentSafetyMenu
                  targetType="account"
                  targetId={person.id}
                  reportedUserId={person.id}
                  targetAuthorId={person.id}
                  targetUsername={person.username}
                  targetLabel="account"
                />
              )}`,
  "Place profile reporting and blocking beside the profile heading actions",
);

replaceOnce(
  "src/pages/MarketplacePage.jsx",
  'import { useToast } from "../hooks/useToast";\n',
  'import { useToast } from "../hooks/useToast";\nimport ContentSafetyMenu from "../components/safety/ContentSafetyMenu";\n',
  "Import Marketplace seller safety actions",
);
replaceOnce(
  "src/pages/MarketplacePage.jsx",
  '{selected.status === "active" && <button type="button" className="marketplace-mini-button danger" onClick={openReportDialog}>Report listing</button>}',
  '<ContentSafetyMenu targetType="account" targetId={selected.seller_id} reportedUserId={selected.seller_id} targetAuthorId={selected.seller_id} targetUsername={selected.seller?.username} targetLabel="account" />{selected.status === "active" && <button type="button" className="marketplace-mini-button danger" onClick={openReportDialog}>Report listing</button>}',
  "Make the Marketplace seller profile reportable/blockable while preserving report listing",
);

replaceOnce(
  "src/routes/AppRoutes.jsx",
  'import MarketplacePage from "../pages/MarketplacePage";\n',
  'import MarketplacePage from "../pages/MarketplacePage";\nimport BlockedAccountsPage from "../pages/BlockedAccountsPage";\nimport ModerationReportsPage from "../pages/ModerationReportsPage";\n',
  "Register blocked-account and moderator pages",
);
replaceOnce(
  "src/routes/AppRoutes.jsx",
  '        </Route>\n\n        <Route path="/search"',
  '        </Route>\n\n        <Route path="/blocked-accounts" element={<ScreenLayout><BlockedAccountsPage /></ScreenLayout>} />\n        <Route path="/moderation/reports" element={<ScreenLayout><ModerationReportsPage /></ScreenLayout>} />\n\n        <Route path="/search"',
  "Add privacy and secure moderation routes under auth protection",
);

const modified = new Set(ops.map((operation) => operation.file));
for (const file of modified) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) throw new Error(`Required source file is missing: ${file}`);
  plan.set(file, fs.readFileSync(absolute, "utf8"));
}

for (const operation of ops) {
  const current = plan.get(operation.file);
  if (current.includes(operation.after)) continue; // this exact change is already present
  const matches = current.split(operation.before).length - 1;
  if (matches === 1) {
    plan.set(operation.file, current.replace(operation.before, operation.after));
    continue;
  }
  if (matches === 0 && current.includes(operation.after)) continue; // already applied
  throw new Error(
    `Cannot safely apply '${operation.description}' in ${operation.file}: expected one exact source anchor, found ${matches}. No source files were written. Check for local edits or a different base revision.`,
  );
}

const requiredNewFiles = [
  "src/utils/contentSafetyRules.js",
  "src/services/supabase/contentSafety.js",
  "src/components/safety/ContentSafetyMenu.jsx",
  "src/components/safety/ReportDialog.jsx",
  "src/pages/BlockedAccountsPage.jsx",
  "src/pages/ModerationReportsPage.jsx",
  "supabase/migrations/20261012150000_content_reporting_hiding_blocking.sql",
  "supabase/diagnostics/content-safety-preflight.sql",
  "tests/content-safety-rules.test.js",
];
for (const file of requiredNewFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Extracted patch file is missing: ${file}`);
}

for (const [file, content] of plan) fs.writeFileSync(path.join(root, file), content, "utf8");
console.log(`Content safety patch applied: ${ops.length} source updates across ${modified.size} files.`);
console.log("No Git commit or push was performed. Review the changed files before testing.");
