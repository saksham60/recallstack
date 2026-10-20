# ReasonAI Android test handoff

Candidate: **1.0.0 (2)**, package `com.recallstack.app`. This is a **debug-signed test build**, not a Play Store release. Production signing remains a later gate, as requested by the owner.

Local APK: `mobile/build/delivery/reasonai-1.0.0-build2-debug.apk`.
Its source commit and SHA-256 are recorded in `build/delivery/artifact-verification.json`. CI also uploads a debug APK for each successful Mobile CI run.

## Install

```powershell
adb install -r mobile/build/delivery/reasonai-1.0.0-build2-debug.apk
adb shell am start -n com.recallstack.app/.MainActivity
```

Alternatively, copy the APK to the phone, open it from Files, and allow installation from that file app. A differently signed existing installation cannot be updated in place. Preserve drafts before choosing to uninstall anything; uninstalling clears local work.

## Live checks for the owner

1. Confirm the ReasonAI launcher icon, splash, login mark/name and Profile version. No Flutter template graphics should appear.
2. Continue with Google. Confirm the browser returns to the app, then reopen the app and confirm the session survives. Supabase must allow `com.recallstack.app://login-callback`.
3. Open DSA, search a familiar problem, change difficulty/category/company/status filters and load remaining catalog pages. Check bookmarks and current-version completion against the web account. No hardcoded catalog or certification claim is supplied by mobile.
4. Open a problem. Read the statement, constraints, examples, contract and public tests. Edit Python with the keyboard toolbar, scroll long lines, undo/redo, background/reopen the app and confirm the draft survives for that account and version.
5. Use one Run and one Submit with your solution. Confirm actual queued/running/terminal statuses, truthful counts/metrics and a saved submission. A passing public Run alone must not become an official Accepted verdict. Hidden inputs and expected answers must remain invisible.
6. Open Submissions & AI. Confirm saved source and Code Intelligence are retrieved. Generating a report should reuse the existing server workflow. Retry a failed AI report without creating another judge submission. Keep smoke testing small; do not launch a batch certification or repeat the 375 independent fixture checks.
7. Change the editor after submitting, then reopen the saved submission: its source must remain unchanged. Discuss that selected submission with ReasonAI and verify the discussion restores when reopened.
8. Check Feed refresh/pagination, story detail/source links, saving/unsaving, Library bookmarks/notes/search, Revision and Profile preferences. Saved-story Library is a device cache; the existing backend does not provide a global saved-story listing for complete cross-device discovery.
9. Interrupt connectivity while viewing results. Reconnect and refresh saved status. Retrying an interrupted create must reuse the original code/key, not silently start another submission. Do not repeatedly tap Submit to recover an unknown response.
10. Sign out and sign into another account. Confirm drafts, saved stories and private conversations are not shown across accounts. Confirm the original account still has its own data when signing back in.

Report phone model/Android version, app version/source SHA, the failing screen/action and the server submission ID where relevant. Do not share tokens, OAuth callback query strings, passwords or private keys.

Production release readiness requires the existing Android signing keystore, signed APK/AAB verification and successful live smoke checks. iOS unsigned compilation is a separate check; Apple signing, export and device testing remain unverified.
