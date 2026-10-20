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
Artifact target: `build/delivery/reasonai-1.0.0-build6-release.apk`; signature,
source SHA and hashes are recorded in `artifact-verification-release6.json`
after packaging. The prior release-5 artifacts and records are preserved.
