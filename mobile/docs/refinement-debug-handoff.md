# ReasonAI mobile refinement — debug testing

Candidate: **1.0.0 (3)**, `com.recallstack.app`.
Application source: `5ae87d324da29b7d04d3829c11025a0728002228` on `feat/mobile-final-refinement`.

## Changes

- DSA metadata requests recover independently. A failed bookmark/category request no longer discards successful learner progress; cancelled or older refreshes cannot overwrite a newer response. Company tags are rendered on cards and indexed by exact problem version. Earlier-version passes are explicitly labelled, and bookmark writes reject repeated taps until acknowledgement.
- Code Intelligence uses readable summary, complexity, evidence, code-quality, improvement and practice sections. Internal field keys and submission UUIDs are removed from the main review UI. Provisional passes have an explicit non-Accepted notice, including the provisional verdict itself when grading metadata is absent.
- Submission reviews, Feed chat and preferences open above shell navigation with safe areas. Preferences scroll within keyboard-constrained space. The coding workspace hides the global bottom bar; editor controls remain available. Empty/error states scroll on short screens, and login works in compact layouts.
- Library notes and study content share Markdown typography, and search no longer opens the keyboard automatically when another Library tab is active. Search distinguishes an empty query from no results. Profile version details wrap beneath their label.
- Shared cards, typography, outlines, snackbar feedback and 48dp button targets follow the existing dark ReasonAI design. Navigation uses selection haptics. Editor line measurements are recomputed only for actual text edits; caret movement no longer rebuilds the editor or schedules a draft write.

No new backend, Supabase migration, judging system, package dependency or production signing credential was added.

## Verification

- Flutter 3.32.5 / Dart 3.8.1.
- `flutter analyze --no-pub`: no issues.
- `flutter test --no-pub`: **63 passed, one optional live probe skipped**.
- New coverage includes partial metadata failures, stale refreshes, duplicate bookmark writes, visible companies/progress on a 320dp screen, reports at 1.6x text scaling, provisional-result labelling, keyboard-constrained preferences, short-screen states and editor selection without draft writes.
- Android API 30 x86_64: the profile-mode device workflow passed login/navigation, code editing, actual SQLite draft persistence and recovery, fixture Run/Submit, history and saved AI report rendering. Auth/network/IME are mocked; this does not establish real OAuth, judging or AI-provider success. The test IME is explicitly registered because profile builds reject Flutter's debug-only input client ID `-1`.
- Profile command: `flutter drive --profile --no-dds --no-enable-impeller --driver=test_driver/refinement_driver.dart --target=integration_test/mobile_workflow_test.dart -d emulator-5554 --dart-define-from-file=build/verified-defines.json --dart-define=CAPTURE_MOBILE_PREVIEWS=true`. The SDK's DDS loopback connection and the emulator's Impeller shader limit required these test-only flags. The normal delivery command does not include them.
- Screenshots of the catalog, Python editor and Code Intelligence were captured under `build/delivery/previews/` and visually checked. The profile diagnostic JSON is `build/delivery/previews/performance.json`. The final emulator sample averaged **12.523 ms build / 21.168 ms raster** with a 130.171 ms worst build frame. This software-emulator sample under host memory pressure does **not** satisfy or prove a 60 FPS physical-device target; representative-device performance remains a gate.

## Verified normal debug package

- `flutter build apk --debug --no-pub --target=lib/main.dart --target-platform android-arm,android-arm64,android-x64 --dart-define-from-file=build/verified-defines.json`: passed.
- APK: `build/delivery/reasonai-1.0.0-build3-debug.apk`, **171,457,847 bytes**.
- SHA-256: `d2abe8da1566c8fe2f530aee75bc47818b0692b275e692d11e41cd5af59ca7e9`.
- `apksigner verify`: Android Debug certificate, v2 signature verified. `aapt`: ReasonAI, version 1.0.0 (3), package `com.recallstack.app`.
- Native library checks passed for ARM, ARM64 and x86_64, each with Flutter and SQLite. Incomplete 32-bit x86 remains excluded.
- Normal entry-point checks found the exact build SHA, no bundled `.env`/define files, no integration-fixture token/report/preview markers, and no matching server-secret key prefix. These checks supplement source/configuration review; they are not a universal secret detector. Public production URLs/key configuration remain the existing validated values, with judge mode disabled.
- Exact normal delivery APK: `adb install -r` returned **Success**, and `am start -W` returned **Status: ok** for MainActivity. The OAuth callback resolved to MainActivity. `build/delivery/reasonai-build3-startup-recheck.png` shows the normal ReasonAI Google sign-in screen with judge mode disabled. No data was uninstalled or cleared.
- The emulator's Android System UI displayed an unresponsive-system dialog during its cold boot. Selecting Wait cleared it, and the branded app then rendered normally. This is recorded as an emulator limitation, not evidence that physical-device responsiveness is established.
- Artifact metadata: `build/delivery/artifact-verification-build3.json`. Packaging/signature, install, launch, profile and analyzer logs remain under `build/`. The later handoff/test-format commit does not change the APK's application code; its exact source SHA remains the one above.

## Installation and remaining gates

The delivery target is `build/delivery/reasonai-1.0.0-build3-debug.apk`. Use `adb install -r` to update an installation with the same debug certificate; do not uninstall or clear app data to bypass a signature mismatch. Follow the [device checklist](device-smoke-checklist.md) for the owner's real-account test.

Production signing remains deferred as requested. This debug APK is not a production release or a `READY FOR CODE FREEZE` verdict. Real-phone OAuth, authenticated Run/Submit/report persistence and representative-device performance still require the owner's smoke test. Windows cannot validate Xcode signing or a signed iOS archive. Mobile saved-story discovery continues to be account/device-cached; no new cross-device guarantee is claimed.
