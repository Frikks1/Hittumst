#!/usr/bin/env python3
"""Read-only demo APK checks. Prints JSON; writes only with explicit --output.

python scripts/verify-demo-apk.py
python scripts/verify-demo-apk.py --output artifacts/android/verification.json --replace

Uses installed Android build-tools (apksigner, aapt, zipalign), JDK and Node.
No extraction, native generation, signing, network request or dependency install.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
import zipfile

ROOT = Path(__file__).resolve().parent.parent
MAX_ENTRY_BYTES = 256 * 1024 * 1024


def sha256_file(filename):
    digest = hashlib.sha256()
    with filename.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def local_path(value):
    resolved = (ROOT / value).resolve()
    if resolved == ROOT or ROOT not in resolved.parents:
        raise ValueError('workspace_path_required')
    return resolved


def elf_alignment(data):
    """Validate every AArch64 ELF64 PT_LOAD alignment and file range."""
    if len(data) < 64 or data[:7] != b'\x7fELF\x02\x01\x01':
        raise ValueError('invalid_arm64_elf')
    header = struct.unpack_from('<HHIQQQIHHHHHH', data, 16)
    _, machine, version, _, phoff, _, _, ehsize, phsize, phnum, *_ = header
    if machine != 183 or version != 1 or ehsize < 64 or phsize < 56:
        raise ValueError('invalid_arm64_elf_header')
    if not 0 < phnum < 4096 or phoff < ehsize or phoff + phsize * phnum > len(data):
        raise ValueError('invalid_elf_program_headers')
    alignments = []
    for index in range(phnum):
        kind, _, offset, virtual, _, file_size, memory_size, alignment = struct.unpack_from(
            '<IIQQQQQQ', data, phoff + index * phsize)
        if kind != 1:
            continue
        if (alignment < 16384 or alignment & (alignment - 1)
                or virtual % alignment != offset % alignment
                or offset + file_size > len(data) or memory_size < file_size):
            raise ValueError('invalid_16k_load_segment')
        alignments.append(alignment)
    if not alignments:
        raise ValueError('missing_elf_load_segment')
    return min(alignments)


def application_boolean(manifest, attribute):
    """Return absent=None, otherwise bool; unknown encodings fail closed."""
    inside = False
    application_indent = 0
    for line in manifest.splitlines():
        indent = len(line) - len(line.lstrip())
        if re.match(r'\s*E: application(?:\s|$)', line):
            inside, application_indent = True, indent
            continue
        if not inside:
            continue
        if line.strip() and indent <= application_indent:
            break
        if indent != application_indent + 2:
            continue
        match = re.match(r'\s*A: android:' + re.escape(attribute) + r'\([^)]*\)=(.*)', line)
        if match:
            value = match.group(1).strip()
            encoded = re.match(r'\(type 0x12\)0x([0-9a-fA-F]+)(?:\s|$)', value)
            if encoded:
                return int(encoded.group(1), 16) != 0
            if value in ('true', '"true"'):
                return True
            if value in ('false', '"false"'):
                return False
            raise ValueError('unknown_application_boolean')
    if not inside:
        raise ValueError('application_manifest_missing')
    return None



def manifest_elements(manifest, element):
    """Read direct attributes of matching compiled-manifest elements."""
    current, base_indent = None, 0
    for line in manifest.splitlines():
        indent = len(line) - len(line.lstrip())
        if current is not None and line.strip() and indent <= base_indent:
            yield current
            current = None
        if re.match(r'\s*E: ' + re.escape(element) + r'(?:\s|$)', line):
            current, base_indent = {}, indent
        elif current is not None and indent == base_indent + 2:
            match = re.match(r'\s*A: android:(\w+)\([^)]*\)=(.*)', line)
            if match:
                current[match.group(1)] = match.group(2).strip()
    if current is not None:
        yield current


def manifest_string(value):
    match = re.match(r'^"([^"]*)"(?:\s|$)', value or '')
    return match.group(1) if match else None


def native_startup_checks(manifest):
    providers = [manifest_string(item.get('name')) for item in manifest_elements(manifest, 'provider')]
    settings = [item for item in manifest_elements(manifest, 'meta-data')
                if manifest_string(item.get('name')) == 'io.sentry.auto-init']
    def explicitly_false(item):
        value = item.get('value', '')
        return bool(re.match(r'^\(type 0x12\)0x0+(?:\s|$)', value)) or value in ('false', '"false"')
    return {
        'nativeInitProviderAbsent': all(not name or name.split('.')[-1] != 'SentryInitProvider' for name in providers),
        'nativePerformanceProviderAbsent': all(not name or name.split('.')[-1] != 'SentryPerformanceProvider' for name in providers),
        'nativeNdkPreloadProviderAbsent': all(not name or name.split('.')[-1] != 'SentryNdkPreloadProvider' for name in providers),
        # Provider removal is definitive; an absent metadata entry is acceptable.
        'nativeAutoInitDisabled': all(explicitly_false(item) for item in settings),
    }


def installed_tools():
    home = Path.home()
    sdk_value = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    sdk = Path(sdk_value) if sdk_value else home / 'scoop/apps/android-clt/current'
    tool_root = sdk / 'build-tools'
    suffix = '.exe' if os.name == 'nt' else ''
    requested = os.environ.get('ANDROID_BUILD_TOOLS_VERSION')
    candidates = [tool_root / requested] if requested else sorted(
        (item for item in tool_root.iterdir() if re.fullmatch(r'\d+(?:\.\d+)*', item.name)),
        key=lambda item: tuple(int(part) for part in item.name.split('.')), reverse=True)
    chosen = next((item for item in candidates if all((item / name).is_file() for name in (
        'aapt' + suffix, 'zipalign' + suffix, 'lib/apksigner.jar'))), None)
    if not chosen:
        raise ValueError('android_build_tools_required')
    java_home = os.environ.get('HITTUMST_JAVA_HOME') or os.environ.get('JAVA_HOME')
    # Match the demo builder's JDK17 fallback instead of an inherited Windows Java8.
    fallback = home / 'scoop/apps/temurin17-jdk/current'
    if os.name == 'nt' and not os.environ.get('HITTUMST_JAVA_HOME') and (fallback / 'bin/java.exe').is_file():
        java_home = str(fallback)
    java = str(Path(java_home) / ('bin/java' + suffix)) if java_home else shutil.which('java')
    node = os.environ.get('HITTUMST_NODE') or shutil.which('node')
    if not java or not Path(java).is_file() or not node or not Path(node).is_file():
        raise ValueError('java_and_node_required')
    return chosen, java, node


def run(command):
    allowed = {'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP',
               'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA', 'JAVA_HOME'}
    environment = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    result = subprocess.run([str(part) for part in command], cwd=ROOT, env=environment,
                            capture_output=True, text=True, encoding='utf-8', errors='replace',
                            timeout=120, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    output = result.stdout + result.stderr
    if len(output) > 4 * 1024 * 1024:
        raise ValueError('unexpected_tool_output_size')
    return result.returncode, output


def source_hash(node):
    code, output = run([node, ROOT / 'scripts/mobile-build-inputs.mjs'])
    value = output.strip()
    if code or not re.fullmatch(r'[0-9a-f]{64}', value):
        raise ValueError('source_fingerprint_failed')
    return value


def verify(build_report):
    report = {'schemaVersion': 1, 'scope': 'local-android-demo-artifact',
              'verifiedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
              'checks': {}, 'passed': False, 'physicalDeviceVerified': False,
              'limitations': ['Development certificate and synthetic demo data; not a store release or connected-backend/device acceptance.']}
    checks = report['checks']
    try:
        build_bytes = build_report.read_bytes()
        build = json.loads(build_bytes)
        apk = local_path(build['apk'])
        configuration = json.loads((ROOT / 'apps/mobile/app.json').read_text(encoding='utf-8'))['expo']
        tools, java, node = installed_tools()
        initial_source = source_hash(node)
        digest = sha256_file(apk)
        report.update(apk=apk.relative_to(ROOT).as_posix(), bytes=apk.stat().st_size,
                      sha256=digest, sourceSha256=build.get('sourceSha256'),
                      currentSourceSha256=initial_source, androidBuildToolsVersion=tools.name)
        checks['completedFromUnchangedSource'] = (build.get('state') == 'complete'
            and build.get('sourceUnchanged') is True and not build.get('failure'))
        checks['demoBuildContract'] = build.get('mode') == 'demo' and build.get('architecture') == 'arm64-v8a'
        checks['sha256MatchesBuild'] = digest == build.get('sha256') and report['bytes'] == build.get('bytes')
        checks['currentSourceMatchesBuild'] = initial_source == build.get('sourceSha256')
        code, signature = run([java, '-jar', tools / 'lib/apksigner.jar', 'verify', '--verbose', '--print-certs', apk])
        checks['signatureVerified'] = code == 0 and bool(re.search(r'^Verifies\s*$', signature, re.M))
        checks['developmentCertificateVerified'] = bool(re.search(r'^Signer #1 certificate DN: .*CN=Android Debug(?:,|$)', signature, re.M))
        suffix = '.exe' if os.name == 'nt' else ''
        code, badging = run([tools / ('aapt' + suffix), 'dump', 'badging', apk])
        manifest_code, manifest = run([tools / ('aapt' + suffix), 'dump', 'xmltree', apk, 'AndroidManifest.xml'])
        checks['manifestInspected'] = code == 0 and manifest_code == 0
        package = re.search(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging, re.M)
        package_name, version_code, version_name = package.groups() if package else ('', '', '')
        minimum = re.search(r"^sdkVersion:'(\d+)'", badging, re.M)
        target = re.search(r"^targetSdkVersion:'(\d+)'", badging, re.M)
        report.update(minimumAndroidApi=int(minimum.group(1)) if minimum else None,
                      targetAndroidApi=int(target.group(1)) if target else None,
                      versionName=version_name, versionCode=int(version_code) if version_code.isdigit() else None)
        checks['identifierPreserved'] = package_name == configuration['android']['package'] == 'is.rummal.app'
        labels = re.findall(r"^application-label(?:-[^:]+)?:'([^']*)'", badging, re.M)
        checks['brandingPreserved'] = bool(labels) and all(label == configuration['name'] == 'Hittumst' for label in labels)
        checks['versionPreserved'] = version_name == configuration['version'] and report['versionCode'] == build.get('versionCode') and isinstance(build.get('versionCode'), int)
        checks['minimumApi24'] = report['minimumAndroidApi'] == 24
        checks['targetApi36'] = report['targetAndroidApi'] == 36
        checks['backupDisabled'] = application_boolean(manifest, 'allowBackup') is False
        checks['notDebuggable'] = application_boolean(manifest, 'debuggable') in (None, False) and 'application-debuggable' not in badging
        checks['noOverlayPermission'] = 'android.permission.SYSTEM_ALERT_WINDOW' not in badging + manifest
        checks.update(native_startup_checks(manifest))
        code, _ = run([tools / ('zipalign' + suffix), '-c', '-P', '16', '-v', '4', apk])
        checks['archive16KiBAlignment'] = code == 0
        with zipfile.ZipFile(apk) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            checks['uniqueArchiveEntries'] = len(names) == len(set(names))
            bundle = [entry for entry in entries if entry.filename == 'assets/index.android.bundle']
            checks['bundledApplicationPresent'] = len(bundle) == 1 and 0 < bundle[0].file_size <= MAX_ENTRY_BYTES
            if checks['bundledApplicationPresent']:
                report['bundledApplicationBytes'] = len(archive.read(bundle[0]))
            native = [entry for entry in entries if entry.filename.endswith('.so')]
            advertised = re.search(r'^native-code:(.*)$', badging, re.M)
            checks['arm64'] = bool(native) and all(entry.filename.startswith('lib/arm64-v8a/') for entry in native) and bool(advertised) and re.findall(r"'([^']+)'", advertised.group(1)) == ['arm64-v8a']
            alignments = []
            for entry in native:
                item = {'library': entry.filename, 'passed': False}
                try:
                    if not 0 < entry.file_size <= MAX_ENTRY_BYTES:
                        raise ValueError('native_entry_size')
                    item['minimumLoadSegmentAlignmentBytes'] = elf_alignment(archive.read(entry))
                    item['passed'] = True
                except (ValueError, struct.error, zipfile.BadZipFile):
                    item['error'] = 'invalid_native_alignment'
                alignments.append(item)
            report['nativeLibraries'] = len(native)
            report['nativeAlignment'] = alignments
            checks['native16KiBAlignment'] = bool(native) and all(item['passed'] for item in alignments)
        checks['sourceUnchangedDuringVerification'] = source_hash(node) == initial_source
        checks['buildReportUnchangedDuringVerification'] = build_report.read_bytes() == build_bytes
        checks['apkUnchangedDuringVerification'] = sha256_file(apk) == digest
        report['passed'] = bool(checks) and all(checks.values())
    except (OSError, ValueError, KeyError, TypeError, struct.error, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        # Never include paths, process environment, arbitrary tool output or secrets.
        report['failureCode'] = 'apk_verification_incomplete'
        report['failureType'] = type(error).__name__
    return report


def write_report(filename, report, replace):
    filename.parent.mkdir(parents=True, exist_ok=True)
    if not replace:
        with filename.open('x', encoding='utf-8') as stream:
            json.dump(report, stream, indent=2)
            stream.write('\n')
        return
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=filename.parent,
                                         prefix=filename.name + '.', suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(report, stream, indent=2)
            stream.write('\n')
        os.replace(temporary, filename)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--build-report', default='artifacts/android/build-report.json')
    parser.add_argument('--output', help='Optional workspace JSON path; otherwise stdout only.')
    parser.add_argument('--replace', action='store_true', help='Explicitly allow replacing --output atomically, including a failed result.')
    args = parser.parse_args()
    try:
        if args.replace and not args.output:
            parser.error('--replace requires --output')
        output = local_path(args.output) if args.output else None
        build_report = local_path(args.build_report)
        if output and (output.suffix != '.json' or output == build_report or (output.exists() and not args.replace)):
            parser.error('output must be a separate JSON report; existing files require --replace')
        report = verify(build_report)
        if output:
            write_report(output, report, args.replace)
        print(json.dumps(report, indent=2))
        return 0 if report['passed'] else 1
    except (OSError, ValueError):
        print(json.dumps({'passed': False, 'failureCode': 'verification_output_failed'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
