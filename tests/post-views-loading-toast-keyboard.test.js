import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("auth bootstrap shows the Campus Connect logo instead of plain loading text", async () => {
  const [routes, css] = await Promise.all([read("src/routes/AppRoutes.jsx"), read("src/styles/loading.css")]);
  assert.match(routes, /className="app-initial-loading-screen"/);
  assert.match(routes, /src="\/campus-connect-logo\.png"/);
  assert.doesNotMatch(routes, /Loading…/);
  assert.match(css, /\.app-initial-loading-logo/);
});

test("post feed cards render actual post view counts when the safe aggregate query is available", async () => {
  const [card, service, migration] = await Promise.all([
    read("src/components/feed/PostCard.jsx"),
    read("src/services/supabase/posts.js"),
    read("supabase/migrations/20261012232526_post_view_counts_for_feed.sql"),
  ]);
  assert.match(card, /post\.viewCount !== null && post\.viewCount !== undefined/);
  assert.match(card, /aria-label=\{`\$\{post\.viewCount\} views`\}/);
  assert.match(card, /post\.viewCount === 1 \? "view" : "views"/);
  assert.match(service, /rpc\("get_post_view_counts"/);
  assert.match(service, /viewCount:/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(migration, /public\.post_views/);
  assert.match(migration, /public\.hidden_posts/);
  assert.match(migration, /grant execute on function public\.get_post_view_counts\(uuid\[\]\) to authenticated/i);
  assert.doesNotMatch(migration, /grant select[^;]*post_views[^;]*authenticated/i);
});

test("opening post detail records a de-duplicated view and refreshes the shared feed cache", async () => {
  const [page, service, posts] = await Promise.all([
    read("src/pages/PostDetailPage.jsx"),
    read("src/services/supabase/posts.js"),
    read("src/hooks/usePosts.jsx"),
  ]);
  assert.match(page, /recordPostView\(postId\)/);
  assert.match(page, /visiblePost\?\.id !== postId/);
  assert.match(page, /updatePostViewCount\(postId, viewCount\)/);
  assert.match(service, /rpc\("record_post_view"/);
  assert.match(posts, /const updatePostViewCount = useCallback/);
});

test("reply counters are not mislabeled as views", async () => {
  const page = await read("src/pages/PostDetailPage.jsx");
  assert.match(page, /visiblePost\.commentCount === 1 \? "reply" : "replies"/);
  assert.doesNotMatch(page, /visiblePost\.commentCount\} TOTAL/);
});

test("toast is Campus Connect branded and fully exits the mobile safe area when hidden", async () => {
  const [context, css] = await Promise.all([read("src/context/ToastContext.jsx"), read("src/styles/globals.css")]);
  assert.match(context, /className="toast-mark"/);
  assert.match(css, /linear-gradient\(135deg, var\(--primary-dark\), var\(--primary\)\)/);
  assert.match(css, /visibility:\s*hidden/);
  assert.match(css, /translate\(-50%, calc\(100% \+ 38px \+ env\(safe-area-inset-bottom, 0px\)\)\)/);
  assert.match(css, /bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test("reply focus adjusts both post-detail and comments modal for the mobile keyboard", async () => {
  const [page, modal, utility, css, composer] = await Promise.all([
    read("src/pages/PostDetailPage.jsx"),
    read("src/components/feed/CommentsModal.jsx"),
    read("src/utils/mobileKeyboardInset.js"),
    read("src/styles/shell-pages.css"),
    read("src/styles/composer.css"),
  ]);
  assert.match(page, /input\?\.focus\(\)/);
  assert.match(page, /attachMobileKeyboardInset\(replyFormRef\.current\)/);
  assert.match(modal, /attachMobileKeyboardInset\(overlayRef\.current\)/);
  assert.match(modal, /input\?\.focus\(\)/);
  assert.match(utility, /window\.visualViewport/);
  assert.match(utility, /--cc-mobile-keyboard-inset/);
  assert.match(css, /bottom: var\(--cc-mobile-keyboard-inset, 0px\)/);
  assert.match(composer, /padding-bottom: var\(--cc-mobile-keyboard-inset, 0px\)/);
});
