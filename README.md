# Campus Connect — Task List 03 / P1-7 patch

Files to replace:
- src/pages/TermsPage.jsx
- src/pages/PrivacyPage.jsx
- src/components/auth/SignupForm.jsx

This patch intentionally does NOT write `terms_accepted_at` to Supabase yet. The
`profiles.terms_accepted_at` column has not been added by the backend step, so
sending that field now would be incorrect. The signup checkbox is enforced
client-side and must be accepted before Step 1 can continue.

Local gate:
1. npm run build
2. Get-ChildItem -Path src -Recurse -File | Select-String -Pattern '<<<<<<<'
3. git add src/pages/TermsPage.jsx src/pages/PrivacyPage.jsx src/components/auth/SignupForm.jsx
4. git commit -m "feat(legal): add terms privacy and signup consent"
5. git push

Manual checks:
- Open /terms and /privacy while signed out and signed in.
- On signup Step 1, leave the checkbox unchecked and press Continue: it must not advance.
- Tick the checkbox and Continue: the signup flow proceeds normally.
- Open Terms/Privacy from the checkbox links and return with the existing back control/browser history.
