# ReasonAI Android test handoff

Candidate: **1.0.0 (5)**, package `com.recallstack.app`. This is a release-signed candidate for device testing. It has not been uploaded to Google Play or approved for public rollout. Its certificate differs from the earlier debug builds: use a separate device or preserve local work before replacing a debug installation.

Local APK: `mobile/build/delivery/reasonai-1.0.0-build5-release.apk`.
Its source commit and SHA-256 are recorded in `build/delivery/artifact-verification-release5.json`. See the [signed candidate handoff](release5-handoff.md). Existing CI debug artifacts remain a different signing identity.

## Install

```powershell
adb install -r mobile/build/delivery/reasonai-1.0.0-build5-release.apk
adb shell am start -n com.recallstack.app/.MainActivity
```

Alternatively, copy the APK to the phone, open it from Files, and allow installation from that file app. A differently signed existing installation cannot be updated in place. Preserve drafts before choosing to uninstall anything; uninstalling clears local work.

## DSA metadata regression check

Open DSA with your existing account and confirm progress totals, company tags and
bookmarks load without the previous broad warning. Select a company and a progress
filter. After a temporary network interruption, Retry should identify and refresh
only unavailable metadata while retaining the loaded list and selected filters.

## Live checks for the owner

1. Confirm the ReasonAI launcher icon, splash, login mark/name and Profile version. No Flutter template graphics should appear.
2. Continue with Google. Confirm the browser returns to the app, then reopen the app and confirm the session survives. Supabase must allow `com.recallstack.app://login-callback`.
3. Open DSA, search a familiar problem, change difficulty/category/company/status filters and load remaining catalog pages. Check bookmarks and current-version completion against the web account. No hardcoded catalog or certification claim is supplied by mobile.
4. Open a problem. Read the statement, constraints, examples, contract and public tests. Edit Python with the keyboard toolbar, scroll long lines, undo/redo, background/reopen the app and confirm the draft survives for that account and version.
5. Use one Run and one Submit with your solution. Confirm actual queued/running/terminal statuses, truthful counts/metrics and a saved submission. A passing public Run alone must not become an official Accepted verdict. Hidden inputs and expected answers must remain invisible.
6. Open Submissions & AI. Confirm saved source and Code Intelligence are retrieved. Generating a report should reuse the existing server workflow. Retry a failed AI report without creating another judge submission. Keep smoke testing small; do not launch a batch certification or repeat the 375 independent fixture checks.
7. Change the editor after submitting, then reopen the saved submission: its source must remain unchanged. Discuss that selected submission with ReasonAI and verify the discussion restores when reopened.
8. Check Feed refresh/pagination, story detail/source links, saving/unsaving, Library bookmarks/notes/search, Revision and Profile preferences. The mobile Saved tab continues to use the account-scoped device cache. The repository now has a server saved-story listing endpoint for web; its deployment and mobile integration are separate from this debug refinement.
9. Verify company names appear below DSA problem progress. A temporary bookmark or company failure should not replace successful progress with "Not started". Check an earlier-version pass is labelled separately. On a small phone, open the AI review, read its complexity/evidence/learning sections, rotate the phone and open preferences with the keyboard; controls should remain reachable by scrolling. Library notes should render headings, lists and code as readable Markdown.
10. Interrupt connectivity while viewing results. Reconnect and refresh saved status. Retrying an interrupted create must reuse the original code/key, not silently start another submission. Do not repeatedly tap Submit to recover an unknown response.
11. Sign out and sign into another account. Confirm drafts, saved stories and private conversations are not shown across accounts. Confirm the original account still has its own data when signing back in.

Report phone model/Android version, app version/source SHA, the failing screen/action and the server submission ID where relevant. Do not share tokens, OAuth callback query strings, passwords or private keys.

Production release readiness requires the existing Android signing keystore, signed APK/AAB verification and successful live smoke checks. iOS unsigned compilation is a separate check; Apple signing, export and device testing remain unverified.
