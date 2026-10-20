# Android release signing

The owner approved creation of the first ReasonAI signing keystore on 2026-10-20.
The private PKCS12 keystore is outside the repository at
`C:/Users/saksh/.reasonai-signing/android-production/reasonai-release.p12`.
Its alias is `reasonai-release`; it contains an RSA-4096 key and a SHA256withRSA
certificate valid for 10,000 days. The non-secret public certificate is tracked
as `release-signing-certificate.pem`.

Public certificate SHA-256:
`086a14cfa02e646995c619b230bd3c296a5e3ce1927968ae3d17dce710eac85f`.

## Local credentials and backup

`android/key.properties` is ignored and points to the keystore. A recovery copy
of that configuration is in the private signing directory. The keystore password
and key password were generated securely and are not printed, committed, placed
in mobile assets, or configured as public build defines. The directory and local
configuration permit only the current Windows account and SYSTEM. This protects
local access; it does not replace a separately encrypted backup.

Before distributing updates, the owner should back up the keystore and its
credential configuration in an encrypted vault/offline location, with recovery
credentials stored securely. No off-device backup has been created or verified
by this task. Do not share the private directory or upload it with the APK/AAB.
The PEM certificate is public and contains no private key.

Future builds must reuse this signing identity. Restore credentials locally from
the private recovery configuration; do not generate a replacement key to resolve
missing-file or signing errors. `key.properties.example` documents the field
names without including credentials.

## Build and verify

Run from `mobile`, using the established Flutter/Android SDK versions:

```powershell
dart run tool/prepare_build.dart build/production-defines.json
flutter build apk --release --no-pub --target-platform android-arm,android-arm64,android-x64 --dart-define-from-file=build/verified-defines.json
flutter build appbundle --release --no-pub --dart-define-from-file=build/verified-defines.json
python tool/verify_android_release.py --sdk C:/Users/saksh/AppData/Local/Android/Sdk --java-home 'E:/Code/Android Studios/jbr' --bundletool build/tools/bundletool-all-1.18.3.jar
```

Release signing is defined in `signingConfigs` before `buildTypes`. Release tasks
fail without the local configuration; there is no debug-certificate fallback.
Release is explicitly non-debuggable. Version 1.0.0 (5) retains package
`com.recallstack.app` and the existing HTTPS production public configuration.

The verifier checks APK and AAB signing against the public certificate, package
identity and version, release flags, native ABIs, 16 KB ELF/ZIP alignment, bundle
structure and expected source SHA. It scans for the exact local signing passwords,
known fixture markers and a server-key pattern in native libraries, and excludes
private configuration/debug snapshots from archive paths. These checks supplement
source review; they are not a universal secret detector. It copies verified
artifacts and records hashes under `build/delivery/`.

Google's bundletool 1.18.3 was downloaded from its official GitHub release and
checked against that release's published SHA-256:
`a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`.

## Distribution and remaining gates

The signed APK supports direct installation. An AAB must be uploaded to an app
distribution service or converted into APKs; it is not installed directly.
The current debug certificate differs from this release certificate. Do not
uninstall the owner's debug app or clear its local drafts to bypass that mismatch.
Use a separate test device/emulator, or preserve local work before switching.

Google Play enrollment and upload have not been performed. Before enrolling,
choose the Play app-signing strategy: a Google-generated app-signing key differs
from this local APK signing identity. Cross-channel updates require compatible
app-signing certificates. This local key can sign an AAB for upload; that alone
does not establish the final Play-delivered certificate. Configure any
certificate-bound integrations for the certificate actually used by that channel.

Real-account Google login/callback, Run/Submit, saved history, Code Intelligence,
bookmarks, account switching and logout must pass on the signed candidate before
production approval. Automated mocked tests and a startup screen do not prove
these flows. iOS signing and physical-device performance remain separate gates.

References: [Flutter Android releases](https://docs.flutter.dev/deployment/android),
[Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756),
[Android 16 KB compatibility](https://developer.android.com/guide/practices/page-sizes).
