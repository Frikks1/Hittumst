import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mobileBuildSourceHash } from './mobile-build-inputs.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Native CMake builds exceed Windows path limits inside the OneDrive workspace.
// A drive alias refers to the same files; never copy or remove the source directory.
if (process.platform === 'win32' && !/^[A-Z]:\\$/i.test(root)) {
  let drive;
  let created = false;
  const realRoot = fs.realpathSync.native(root).toLowerCase();
  for (const letter of [
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
  ]) {
    const candidate = letter + ':';
    if (fs.existsSync(candidate + '\\')) {
      if (fs.realpathSync.native(candidate + '\\').toLowerCase() === realRoot) {
        drive = candidate;
        break;
      }
      continue;
    }
    const result = spawnSync('subst.exe', [candidate, root], { windowsHide: true });
    if (result.status === 0) {
      drive = candidate;
      created = true;
      break;
    }
  }
  if (!drive) throw new Error('No free Windows drive alias is available for the native build.');
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [drive + '/scripts/build-demo-apk.mjs'], {
        cwd: drive + '/',
        env: process.env,
        windowsHide: true,
        stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('close', (value) => resolve(value ?? 1));
    });
    process.exitCode = code;
  } finally {
    if (created) {
      const result = spawnSync('subst.exe', [drive, '/D'], { windowsHide: true });
      if (result.status !== 0)
        console.warn('Build ended; remove temporary drive alias ' + drive + ' manually.');
    }
  }
  process.exit(process.exitCode ?? 0);
}
const mobile = path.join(root, 'apps/mobile');
const output = path.join(root, 'artifacts/android');
fs.mkdirSync(output, { recursive: true });
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith('EXPO_') && !/^(SENTRY|REVENUECAT|APPLE_|SUPABASE_|LIVEKIT_)/.test(key),
  ),
);
Object.assign(env, {
  CI: '1',
  EXPO_NO_DOTENV: '1',
  EXPO_PUBLIC_APP_ENV: 'development',
  EXPO_PUBLIC_DEV_BYPASS_AUTH: 'false',
  EXPO_PUBLIC_HITTINGAR_ENABLED: 'true',
  SENTRY_DISABLE_AUTO_UPLOAD: 'true',
});
if (process.platform === 'win32') {
  env.JAVA_HOME ??= path.join(process.env.USERPROFILE, 'scoop/apps/temurin17-jdk/current');
  env.ANDROID_HOME ??= path.join(process.env.USERPROFILE, 'scoop/apps/android-clt/current');
  // Ignore an inherited Java 8 installation for this build.
  if (process.env.HITTUMST_JAVA_HOME) env.JAVA_HOME = process.env.HITTUMST_JAVA_HOME;
  else if (
    fs.existsSync(
      path.join(process.env.USERPROFILE, 'scoop/apps/temurin17-jdk/current/bin/java.exe'),
    )
  )
    env.JAVA_HOME = path.join(process.env.USERPROFILE, 'scoop/apps/temurin17-jdk/current');
}
env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
if (process.platform === 'win32' && /^[A-Z]:\\$/i.test(root)) {
  env.HITTUMST_BUILD_REAL_ROOT = fs.realpathSync.native(root);
  env.HITTUMST_BUILD_ALIAS = root;
  env.NODE_OPTIONS =
    (env.NODE_OPTIONS ?? '') + ' --require=' + path.join(root, 'scripts/windows-build-paths.cjs');
}
if (!env.JAVA_HOME || !env.ANDROID_HOME)
  throw new Error('Set JAVA_HOME and ANDROID_HOME to installed JDK17+ and Android SDK.');
const originalPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.PATH = [path.join(env.JAVA_HOME, 'bin'), path.dirname(process.execPath), originalPath].join(
  path.delimiter,
);
const sourceHash = () => mobileBuildSourceHash(root);
const initial = sourceHash();
const report = {
  mode: 'demo',
  architecture: 'arm64-v8a',
  versionCode: 2026093001,
  startedAt: new Date().toISOString(),
  sourceSha256: initial,
  signing: 'Android debug certificate, testing only',
  state: 'building',
  backend:
    'none; synthetic data, no real payments, purchases, push, media provider or voice service',
};
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
async function run(name, command, args, cwd) {
  console.log('Starting ' + name);
  const log = fs.createWriteStream(path.join(output, name + '.log'));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => log.write(chunk));
    child.stderr.on('data', (chunk) => log.write(chunk));
    child.on('error', reject);
    child.on('close', resolve);
  });
  await new Promise((resolve) => log.end(resolve));
  console.log(name + ': exit ' + code);
  if (code !== 0) throw new Error(name + ' failed; inspect artifacts/android/' + name + '.log');
}
try {
  await run(
    'prebuild',
    process.execPath,
    [
      path.join(root, 'node_modules/expo/bin/cli'),
      'prebuild',
      '--platform',
      'android',
      '--no-install',
      '--no-clean',
    ],
    mobile,
  );
  const gradleFile = path.join(mobile, 'android/app/build.gradle');
  const gradle = fs.readFileSync(gradleFile, 'utf8');
  const releaseBlock = gradle.match(/^        release \{([\s\S]*?)^        \}/m)?.[1];
  if (!releaseBlock || !/signingConfig signingConfigs\.debug\b/.test(releaseBlock))
    throw new Error('Expected test signing; will not use unknown production credentials.');
  fs.writeFileSync(
    gradleFile,
    gradle.replace(/versionCode \d+/, 'versionCode ' + report.versionCode),
  );
  fs.writeFileSync(
    path.join(mobile, 'android/local.properties'),
    'sdk.dir=' + env.ANDROID_HOME.replaceAll('\\', '/') + '\n',
  );
  const args = [
    ':app:assembleRelease',
    '--no-daemon',
    '--no-parallel',
    '--max-workers=1',
    '-PreactNativeArchitectures=arm64-v8a',
    '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=768m',
  ];
  if (process.platform === 'win32')
    await run(
      'gradle',
      env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'gradlew.bat', ...args],
      path.join(mobile, 'android'),
    );
  else await run('gradle', './gradlew', args, path.join(mobile, 'android'));
  const apk = path.join(mobile, 'android/app/build/outputs/apk/release/app-release.apk');
  const bytes = fs.readFileSync(apk);
  const destination = path.join(output, 'Hittumst-demo-arm64-2026-09-30.apk');
  Object.assign(report, {
    apk: path.relative(root, destination).replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sourceUnchanged: sourceHash() === initial,
    completedAt: new Date().toISOString(),
  });
  if (!report.sourceUnchanged)
    throw new Error('Source changed during compilation; rebuild before handing off this APK.');
  fs.copyFileSync(apk, destination);
  console.log('Test APK ready: ' + destination);
} catch (error) {
  report.failure = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.state = report.failure ? 'failed' : 'complete';
  fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
}
