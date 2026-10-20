# DSA Explorer — release 1.0.0 (6)

The page-wide progress/company warning banner has been removed entirely. Optional
metadata failures cannot insert a MaterialBanner above the problem list.

Recovery stays available through the existing refresh icon and the affected
filters: Reload categories, Reload progress/bookmarks, or Reload companies inside
the company picker. Company options update in place after recovery. Successful
data, filters and catalog pagination are retained during optional-data retries.
Previously loaded progress is labelled `(saved)` when refresh fails; absent
progress says `Progress not loaded`, without inventing a Not started status.

The owner reports release 5 installed. Inspection of our build-5 artifact found
the older quoted sentence absent, but that build still had a shared warning
banner with source-specific wording. This change removes the component itself;
it does not assume a cause for the message on the owner's phone.

Verification: `flutter analyze --no-pub` passed; `flutter test --no-pub` passed
74 tests, with one optional live probe skipped. Coverage includes all optional
requests failing without a page banner, preserved solved status, independent
retry, company-picker recovery and unchanged filters/cursors. No backend or
database changes, live AI calls or judging-fixture recertification were performed.

The signed APK uses the existing release key, package `com.recallstack.app` and
version 1.0.0 (6), supporting an in-place update from our signed release 5.
The prior release-5 artifacts and records are preserved.

## Verified artifacts

Application source: `1bb7c0c1cdee4e699e172546ff42ef5c93d8bd4d`.

- APK: `build/delivery/reasonai-1.0.0-build6-release.apk`, 62,333,300 bytes.
  SHA-256: `9a442fdd3465f09d86c0d7b0c2f77e96392fc472208a52ca5bdf9cca6ee95b99`.
- AAB: `build/delivery/reasonai-1.0.0-build6-release.aab`, 47,986,628 bytes.
  SHA-256: `d0286107f71fc5de9924b3a9309e98a48bc689961f6328278a9bb903fa940d6e`.
- APK and AAB signatures match the existing public release certificate. Package,
  version, release flags, native libraries, 16 KB static alignment and bundletool
  validation passed, along with the existing credential/fixture exclusion checks.
- Every compiled application ABI excludes both the original generic warning
  sentence and the removed source-specific banner wording. New filter-recovery
  labels are present. This is recorded in `catalog-banner-scan-release6.json`.

Artifact provenance is in `build/delivery/artifact-verification-release6.json`.
Live authenticated production metadata retrieval has not been tested here; the
error-state UI is covered by mocked widget tests. Real-account device checks and
the remaining release gates in `release-readiness.md` still apply.

## In-place update check

The exact APK upgraded the existing signed build 5 on the separate API 30 x86_64
release-validation emulator using `adb install -r` (`Success`). Version 6 was
confirmed and the original package first-install timestamp was retained. No
uninstall or data clear was performed. Hardware/NVIDIA graphics were used, as
documented for release 5. Cold startup returned `Status: ok` in 2,194 ms, the
normal ReasonAI Google sign-in screen was visually checked, and the installed
APK hash matches the delivery artifact. Android rejects `run-as` debugging.

Evidence: `install-release6.txt`, `installed-package-release6.txt`,
`startup-release6.txt`, `installed-apk-sha256-release6.txt`,
`nondebuggable-release6.txt` and `reasonai-release6-startup.png` under
`build/delivery/`. This startup check does not establish authenticated DSA API
success or physical-device performance.
