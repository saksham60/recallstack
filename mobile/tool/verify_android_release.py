"""Verify locally built release artifacts; never distribute signing credentials.

Requires Android SDK build-tools 36, JDK 17+, and Google's bundletool-all JAR.
Run from mobile; see docs/android-release-signing.md for the command.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import ssl
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def execute(args):
    result = subprocess.run(
        [str(arg) for arg in args], capture_output=True, text=True, timeout=180
    )
    require(result.returncode == 0, f"Verification command failed: {args[0]}")
    return result.stdout + result.stderr


def elf_alignments(data):
    require(data[:4] == b"\x7fELF", "Native library is not ELF")
    endian = "<" if data[5] == 1 else ">"
    if data[4] == 2:
        offset = struct.unpack_from(endian + "Q", data, 32)[0]
        size, count = struct.unpack_from(endian + "HH", data, 54)
        alignment_offset, alignment_type = 48, "Q"
    else:
        offset = struct.unpack_from(endian + "I", data, 28)[0]
        size, count = struct.unpack_from(endian + "HH", data, 42)
        alignment_offset, alignment_type = 28, "I"
    return [
        struct.unpack_from(endian + alignment_type, data,
                           offset + index * size + alignment_offset)[0]
        for index in range(count)
        if struct.unpack_from(endian + "I", data, offset + index * size)[0] == 1
    ]


def check_archive(path, sha, private_values, bundle=False):
    prefix = "base/lib" if bundle else "lib"
    result = {}
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        forbidden = (".env", "key.properties", ".jks", ".p12", ".keystore",
                     "production-defines.json", "verified-defines.json",
                     "kernel_blob.bin", "vm_snapshot_data", "isolate_snapshot_data")
        require(not any(name.endswith(forbidden) for name in names),
                "Private configuration or debug snapshot packaged")
        for abi in ("armeabi-v7a", "arm64-v8a", "x86_64"):
            for library in ("libapp.so", "libflutter.so", "libsqlite3.so"):
                require(f"{prefix}/{abi}/{library}" in names,
                        f"Missing {abi}/{library}")
        require(not any(name.startswith(prefix + "/x86/") for name in names),
                "Incomplete x86 ABI packaged")
        for name in names:
            if not name.endswith(".so"):
                continue
            data = archive.read(name)
            for marker in private_values + [b"fixture-only-token", b"Fixture saved analysis"]:
                require(marker not in data, "Credential or integration fixture packaged")
            require(not re.search(rb"sb_secret_[A-Za-z0-9_-]{16,}", data),
                    "Server credential pattern packaged")
            alignments = elf_alignments(data)
            require(bool(alignments), f"No ELF LOAD segments: {name}")
            result[name] = min(alignments)
            if "/arm64-v8a/" in name or "/x86_64/" in name:
                require(min(alignments) >= 16384,
                        f"64-bit ELF is not 16 KB aligned: {name}")
                if name.endswith("/libapp.so"):
                    require(sha.encode() in data, "Release source SHA missing")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, required=True)
    parser.add_argument("--java-home", type=Path, required=True)
    parser.add_argument("--bundletool", type=Path, required=True)
    parser.add_argument("--apk", type=Path,
                        default=Path("build/app/outputs/flutter-apk/app-release.apk"))
    parser.add_argument("--aab", type=Path,
                        default=Path("build/app/outputs/bundle/release/app-release.aab"))
    args = parser.parse_args()
    delivery = Path("build/delivery")
    delivery.mkdir(parents=True, exist_ok=True)
    tools = args.sdk / "build-tools/36.0.0"
    java = args.java_home / "bin/java.exe"
    version, code = re.search(r"^version: ([\d.]+)\+(\d+)$",
                              Path("pubspec.yaml").read_text(), re.M).groups()
    defines = json.loads(Path("build/verified-defines.json").read_text())
    sha = defines["BUILD_SHA"]
    require(defines["HACKATHON_JUDGE_MODE"] == "false", "Judge mode enabled")
    certificate = Path("docs/release-signing-certificate.pem").read_text()
    fingerprint = hashlib.sha256(ssl.PEM_cert_to_DER_cert(certificate)).hexdigest()
    # Only read exact local secrets for a non-printing exclusion check.
    private_values = [line.split("=", 1)[1].encode() for line in
                      Path("android/key.properties").read_text().splitlines()
                      if line.startswith(("storePassword=", "keyPassword="))]
    require(all(len(value) >= 16 for value in private_values) and private_values,
            "Release password exclusion check requires configured credentials")
    badging = execute([tools / "aapt.exe", "dump", "badging", args.apk])
    manifest = execute([tools / "aapt.exe", "dump", "xmltree", args.apk,
                        "AndroidManifest.xml"])
    require(f"name='com.recallstack.app' versionCode='{code}' versionName='{version}'"
            in badging, "APK identity/version mismatch")
    require("application-label:'ReasonAI'" in badging, "Branding mismatch")
    require("application-debuggable" not in badging, "Debuggable APK")
    for flag in ("usesCleartextTraffic", "allowBackup"):
        require(re.search(r"android:" + flag + r".*=\(type 0x12\)0x0\s", manifest),
                f"Release manifest must disable {flag}")
    require("com.recallstack.app" in manifest and "login-callback" in manifest,
            "Authentication callback missing")
    signature = execute([java, "-jar", tools / "lib/apksigner.jar", "verify",
                         "--verbose", "--print-certs", args.apk])
    require("certificate SHA-256 digest: " + fingerprint in signature,
            "APK certificate does not match the approved public certificate")
    require("CN=Android Debug" not in signature, "Debug signing certificate")
    require("Verified using v2 scheme (APK Signature Scheme v2): true" in signature,
            "APK v2 signature missing")
    alignment = execute([tools / "zipalign.exe", "-c", "-P", "16", "-v", "4", args.apk])
    jar = execute([args.java_home / "bin/jarsigner.exe", "-verify", "-verbose",
                   "-certs", args.aab])
    require("jar verified." in jar and "unsigned entries" not in jar,
            "AAB JAR signature verification failed")
    aab_cert = execute([args.java_home / "bin/keytool.exe", "-printcert",
                        "-jarfile", args.aab])
    require(fingerprint in aab_cert.replace(":", "").lower(), "AAB signer mismatch")
    bundle = [java, "-jar", args.bundletool]
    validation = execute(bundle + ["validate", "--bundle=" + str(args.aab)])
    config = execute(bundle + ["dump", "config", "--bundle=" + str(args.aab)])
    require("PAGE_ALIGNMENT_16K" in config, "AAB does not request 16 KB alignment")
    bundle_manifest = execute(bundle + ["dump", "manifest", "--bundle=" + str(args.aab),
                                        "--module=base"])
    root = ET.fromstring(bundle_manifest)
    android = "{http://schemas.android.com/apk/res/android}"
    require(root.attrib.get("package") == "com.recallstack.app" and
            root.attrib.get(android + "versionCode") == code and
            root.attrib.get(android + "versionName") == version, "AAB manifest mismatch")
    require(root.find("application").attrib.get(android + "debuggable", "false") == "false",
            "Debuggable AAB")
    libraries = {"apk": check_archive(args.apk, sha, private_values),
                 "aab": check_archive(args.aab, sha, private_values, bundle=True)}
    logs = {"apk-metadata": badging, "apk-manifest": manifest, "apk-signature": signature,
            "zipalign": alignment, "aab-signature": jar, "aab-certificate": aab_cert,
            "bundle-validation": validation, "bundle-config": config}
    for label, content in logs.items():
        (delivery / f"{label}-release{code}.txt").write_text(content)
    artifacts = []
    for source in (args.apk, args.aab):
        target = delivery / f"reasonai-{version}-build{code}-release{source.suffix}"
        shutil.copyfile(source, target)
        artifacts.append({"path": str(target), "bytes": target.stat().st_size,
                          "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
    record = {"version": version + "+" + code, "source_sha": sha,
              "package": "com.recallstack.app", "certificate_sha256": fingerprint,
              "artifacts": artifacts, "elf_load_alignment": libraries,
              "zip_alignment": "16 KB verified", "aab_validation": "passed",
              "private_configuration_and_fixture_scan": "passed; supplements source review",
              "authenticated_device_test": "pending", "play_publication": "not performed"}
    (delivery / f"artifact-verification-release{code}.json").write_text(json.dumps(record, indent=2))
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
