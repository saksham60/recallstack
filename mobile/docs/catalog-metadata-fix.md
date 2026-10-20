# DSA Explorer metadata recovery — 1.0.0 (4)

## Root cause

The canonical mobile bookmark reader requested `page_size=100` from
`GET /api/v1/dsa/me/bookmarks`. That DSA route uses `Limit` with a maximum of 50,
unlike the generic learning bookmark endpoint. The deployed backend's public
`/openapi.json` was checked on 2026-10-20 and confirms the same maximum. With a
valid session, the old request fails HTTP validation (422).

Explorer combined bookmark, category, progress and company failures into the
same “Progress or company metadata is unavailable” warning. Thus successful
progress totals and company tags could appear alongside that misleading banner.
The screenshot alone does not identify the phone's actual HTTP response; the
request/contract mismatch is independently confirmed in source and deployed schema.

A second recovery defect affected company pages: one failed page left a sticky
error, and Retry reset the whole catalog instead of recovering the missing tags.

## Correction

- Canonical bookmarks use 50 items per page and still traverse every page.
- Warnings identify the actual failing source. Successful data remains visible.
- Retry fetches only failed metadata sources and missing company versions, in
  bounded batches. Existing catalog objects, cursor, progress and filter selections
  are retained. Successful empty company responses are valid and add no tags.
- Pending retries reject repeated taps. Refresh/search and disposal invalidate
  stale company responses; company tags are merged by version and slug.
- A bookmark failure disables only the bookmark status option, leaving progress
  filters and All statuses usable. Bookmark retries do not mark progress as loading.

No backend deployment, production database change or new dependency is required.

## Verification

- `flutter analyze --no-pub`: no issues.
- `flutter test --no-pub --reporter expanded`: 72 passed; one optional live probe
  skipped. No live judge/AI calls or independent execution-fixture recertification.
- Nine focused regression cases cover the 422 contract mismatch, multi-page
  bookmarks, persistent company-page failure, targeted recovery, no duplicate
  requests/tags, stale responses, empty company metadata, independent metadata
  recovery and a 320dp widget with working progress/company tags during a bookmark
  failure.
- The shared mock API now rejects DSA bookmark page sizes above 50, preventing
  future tests from silently accepting the incompatible request.

## Verified debug delivery

- APK: `build/delivery/reasonai-1.0.0-build4-debug.apk`, 171,459,627 bytes.
- Application source: `0ffe142212bade8b0d6d05576c623378237ea5af`.
- SHA-256: `2e73c12afda8e6738786923b1ccee38b1af790f54661311149057da24855783f`.
- Normal `lib/main.dart` debug APK built successfully, with existing validated
  production public configuration and judge mode disabled. Android Debug v2
  signature verified; package `com.recallstack.app`, version 1.0.0 (4), ReasonAI
  label; Flutter and SQLite native libraries present for ARM, ARM64 and x86_64.
- Artifact checks confirm its source SHA, exclude define/environment assets and
  integration-fixture markers, and scan for the server-secret prefix. These
  checks supplement source review and do not constitute a universal secret scan.
- Android API 30 x86_64: `adb install -r` updated the existing version 3 to version
  4 with `Success`; no uninstall or data clear. `am start -W` returned `Status:
  ok`; MainActivity remained resumed and its process alive. The startup screenshot
  shows the normal branded Google sign-in screen. The emulator needed a cold boot;
  no physical-device performance claim is made.
- Evidence: `build/delivery/artifact-verification-build4.json`,
  `install-build4.txt`, `startup-build4.txt`, `reasonai-build4-startup.png`, and
  `deployed-dsa-bookmark-contract-build4.json`. Build-3 artifacts are preserved.

Production signing remains deferred. Real-account verification on the owner's
phone remains necessary and is not replaced by mocked tests or the startup smoke
check. No authenticated user session or paid judge/AI service was used here.
