# ReasonAI Android signed candidate — 1.0.0 (5)

Package: `com.recallstack.app`. Application source:
`f8a808e074062bb903c9c56874bbda036f3a75e0` on `feat/mobile-final-refinement`.
This is a release-signed device-test candidate, not a public deployment or a
`READY FOR CODE FREEZE` verdict.

## Artifacts

| Artifact | Location | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Signed APK | `build/delivery/reasonai-1.0.0-build5-release.apk` | 62,333,300 | `426317dd3d17521a0fee844216ee6a99b7302809b4886c8008aa4ff33c24029a` |
| Signed AAB | `build/delivery/reasonai-1.0.0-build5-release.aab` | 47,995,757 | `ee244008a7bf22ffadaf55adf27d67c8a3031b73e658a591262b298cf2a627a2` |

Only these artifacts and public verification records should be shared with
testers. Never distribute the signing directory or `key.properties`.

## Signing

The owner approved creation of the first keystore on 2026-10-20. Local signing
uses RSA-4096 / PKCS12, alias `reasonai-release`. Public certificate SHA-256:
`086a14cfa02e646995c619b230bd3c296a5e3ce1927968ae3d17dce710eac85f`.
The private key and recovery configuration are in
`C:/Users/saksh/.reasonai-signing/android-production/`, restricted to the Windows
owner and SYSTEM. The local ignored configuration is `android/key.properties`.
The owner must make an encrypted off-device backup; none has been verified here.
See [signing and recovery instructions](android-release-signing.md).

## Verified checks

- Flutter 3.32.5 / Dart 3.8.1, Android SDK 36 and the existing pinned toolchain.
- `flutter analyze --no-pub`: no issues; `flutter test --no-pub`: 72 passed,
  one optional live probe skipped. No paid sandbox/AI calls or re-certification.
- Normal `flutter build apk --release` and `flutter build appbundle --release`
  passed with validated production public configuration, judge mode disabled,
  and the recorded source SHA. The first `--no-pub` attempt hit the upstream
  test-plugin registration issue; normal Flutter generation corrected it without
  changing generated registrants or including integration-test code in release.
- APK v2 signature verified against the new certificate; AAB JAR signature and
  signer certificate verified against the same certificate. Self-signed
  certificate-chain and absent timestamp warnings from JAR verification are
  expected for this Android signing identity, not a failed signature check.
- APK and AAB package/version match; APK label is ReasonAI; min SDK 24, target
  SDK 36. APK is not debuggable, cleartext traffic and backup are disabled, and
  the OAuth callback is present. Permissions are INTERNET and the AndroidX
  signature-level dynamic-receiver protection permission.
- Flutter, application and SQLite libraries are present for ARM, ARM64 and
  x86_64. All 64-bit ELF LOAD segments satisfy 16 KB alignment. APK ZIP alignment
  passed `zipalign -c -P 16`; bundletool validation passed and AAB configuration
  requests `PAGE_ALIGNMENT_16K`. No 16 KB runtime emulator was used.
- Artifact checks found the expected source SHA, no configuration/keystore/debug
  snapshot paths, no exact local signing password or known fixture markers in
  native libraries, and no matching server-key prefix. This supplements source
  review and does not constitute a universal secret detector.
- Flutter logged an optional Cupertino icon-font tree-shaker warning; app code
  has no direct Cupertino icon usage. Android glyph/startup validation and iOS
  adaptive-control coverage are distinct checks; iOS remains a separate gate.
- Exact delivery APK installed successfully on the separate API 30 x86_64
  `ReasonAIReleaseValidation` emulator. The on-device APK SHA-256 matches the
  delivery artifact. Android rejects `run-as` because the installed app is not
  debuggable; the OAuth callback resolves to MainActivity. The normal ReasonAI
  Google sign-in screen was visually verified in `reasonai-release5-startup.png`.
- Initial software-GPU startup hit an Impeller shader uniform limit and timed
  out. Hardware graphics (`-gpu host`, NVIDIA OpenGL translator) rendered the
  unchanged delivery APK. Its first launch during emulator cold boot was also
  slow; a subsequent cold app-launch recheck returned `Status: ok`, 2,306 ms.
  The failed startup records are preserved alongside the successful recheck.
  No renderer-disabling app flag or production manifest workaround was used.
  This establishes startup on that emulator, not physical-device smoothness or
  authenticated API success.

Static evidence is in `build/delivery/artifact-verification-release5.json`,
`*-release5.txt`, `build/release5-analyze.log`, `build/release5-tests.log`,
`build/release5-apk-final.log` and `build/release5-aab-final.log`.
Device evidence includes `install-release5.txt`, `startup-release5-recheck.txt`,
`nondebuggable-release5.txt`, `callback-resolution-release5.txt`,
`installed-apk-sha256-release5.txt` and `reasonai-release5-startup.png`.

## Remaining delivery gates

Complete the [real-account device checklist](device-smoke-checklist.md) on this
signed candidate: Google login/callback, actual Run/Submit, persisted history and
Code Intelligence, bookmarks, account switch and logout. Host mocks and a startup
screen cannot establish authenticated production success. Retain the prior debug
app's local work when switching signing identities.

Google Play upload/enrollment and listing/policy setup have not been performed.
Choose the distribution channel and Play app-signing strategy before rollout.
Windows cannot validate an iOS signed archive, and representative physical-device
performance remains unverified. The current mobile saved-story cache limitations
in the release-readiness document are unchanged.
