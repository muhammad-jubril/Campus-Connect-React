/** Return the visible nesting depth for one comment, capped to keep layout usable. */
export function getCommentDepth(comment, comments, maxDepth = 4) {
  if (!comment?.id || !Array.isArray(comments) || maxDepth <= 0) return 0;
  const byId = new Map(comments.map((item) => [item.id, item]));
  const visited = new Set([comment.id]);
  let parentId = comment.parentCommentId;
  let depth = 0;

  while (parentId && depth < maxDepth) {
    if (visited.has(parentId)) break;
    const parent = byId.get(parentId);
    if (!parent) break; // A hidden/deleted parent can leave a visible child.
    visited.add(parentId);
    depth += 1;
    parentId = parent.parentCommentId;
  }

  return depth;
}
