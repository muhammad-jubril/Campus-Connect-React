Campus Connect — Mobile/desktop shell fix + post detail, replies, sharing, and views

FILES IN THIS PATCH
- src/styles/shell.css
- src/styles/shell-pages.css
- src/components/feed/PostCard.jsx
- src/pages/PostDetailPage.jsx (new)
- src/routes/AppRoutes.jsx
- src/hooks/usePosts.jsx
- src/services/supabase/posts.js
- src/services/supabase/comments.js
- src/components/feed/CommentsModal.jsx
- supabase/migrations/20261010170001_post_views.sql (new)

WHAT CHANGES
1. Mobile: hides the desktop sidebar by default. The existing off-canvas drawer remains controlled by its closed-by-default React state.
2. Desktop: constrains the app shell to the viewport so the top navigation and left sidebar stay visible while the central content pane scrolls. Very short desktop viewports may scroll only within the sidebar as a fallback so navigation remains reachable.
3. Posts: tapping the post card/content opens /post/:postId. The author header still opens the author's profile; post action buttons do their own action instead of triggering navigation.
4. Detail view: renders the selected post with inline replies, a reply composer, and deletion controls for the reply author or post author. The post's comment action opens the detail view and focuses the reply composer.
5. Sharing: uses the device's native share sheet when available, otherwise copies the direct post URL to the clipboard.
6. Views: includes a migration and RPC to count unique authenticated accounts that opened a post. This is a unique-account view count, not a raw impression-event counter. Viewer identities are not exposed through the client API.
7. Pagination preserved: posts.js and usePosts.jsx are based on the already-tested P2-3 pagination version. The 20-post get_feed_posts flow remains in place; the hook adds syncPost so a freshly loaded detail record updates an already-cached feed/profile post.

DATABASE REQUIREMENT
The post detail page remains usable before the view-count migration is applied; the Views line reports that the count is unavailable rather than inventing a number. Apply and verify supabase/migrations/20261010170001_post_views.sql in the linked Supabase project before expecting real counts. If you use Claude for live Supabase changes, give it this exact migration and ask it to apply/verify it without changing the function contract.

COMMIT HYGIENE BEFORE APPLYING
This patch updates posts.js and usePosts.jsx on top of the already-tested P2-3 pagination code. To keep the one-task/one-commit history clean, first run:
 git status --short

If the earlier P2-3 pagination files are still pending locally, commit that tested task BEFORE extracting this ZIP:
 git add src/services/supabase/posts.js src/hooks/usePosts.jsx src/pages/FeedPage.jsx
 git commit -m "feat(feed): paginate posts with feed RPC"
 git push

Only do that P2-3 commit if those three files are still the uncommitted pagination changes. If P2-3 is already committed, skip that step.

APPLY
Extract this ZIP into the repository root, preserving the src/ and supabase/ directory paths. Replace the listed files. Do not replace FeedPage.jsx: the pagination version you already tested is intentionally left untouched.

RUN CHECKS
npm run lint
npm run build
Select-String -Path src\* -Pattern '<<<<<<<|>>>>>>>' -Recurse

BROWSER QA
- Mobile: reload at a phone-width viewport; the desktop sidebar should be hidden. Open and close the hamburger drawer; the drawer should slide in over the page rather than becoming the page layout.
- Desktop: scroll a long feed; the top navigation and left sidebar should remain in place while only the main content pane scrolls.
- Open a post by clicking its text/card space or media; check that author names still open profiles and like/share/menu buttons do not navigate unexpectedly.
- Open Replies from the feed; add a reply and verify the count/list update. Verify reply deletion for the reply author/post author.
- Share: test the device share sheet on mobile and clipboard fallback on desktop.
- Views: after the migration is applied, open a post and verify the unique-view count returns. Reloading the same post as the same account should not increment it again.

SUGGESTED SINGLE COMMIT AFTER CHECKS
 git add src/styles/shell.css src/styles/shell-pages.css src/components/feed/PostCard.jsx src/pages/PostDetailPage.jsx src/routes/AppRoutes.jsx src/hooks/usePosts.jsx src/services/supabase/posts.js src/services/supabase/comments.js src/components/feed/CommentsModal.jsx supabase/migrations/20261010170001_post_views.sql
 git commit -m "feat(feed): add post details and fix shell layout"
 git push
