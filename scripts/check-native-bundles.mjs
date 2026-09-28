// Local-only native bundle and Expo configuration evidence. Never reads a project .env file.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(root, 'apps/mobile');
const artifact = path.join(root, 'artifacts/native');
const output = path.join(project, 'dist-native-check');
const startedAt = new Date().toISOString();
const report = { startedAt, completedAt: null, scope: 'Local development Supabase, live authentication, Hittingar enabled; unsigned JavaScript/Hermes export only', checks: [], bundles: [], limitations: ['No signed native build', 'No physical-device execution', 'No hosted staging or production deployment'] };
fs.mkdirSync(artifact, { recursive: true });
let redactions = [];
const redact = value => redactions.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), String(value));
const cli = path.join(root, 'node_modules/expo/bin/cli');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

async function main() {
  const linuxRoot = root.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replaceAll('\\', '/');
  const raw = process.platform === 'win32'
    ? execFileSync('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--', 'sh', '-s'], { input: `cd ${quote(linuxRoot)}\nsupabase status -o json\n`, encoding: 'utf8', timeout: 45000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    : execFileSync('supabase', ['status', '-o', 'json'], { cwd: root, encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] });
  const local = JSON.parse(raw.slice(raw.indexOf('{')));
  redactions = Object.entries(local).filter(([key, value]) => /KEY|SECRET|TOKEN|JWT/i.test(key) && typeof value === 'string' && value.length > 10).map(([, value]) => value);
  if (local.API_URL !== 'http://127.0.0.1:54321' || !local.PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw new Error('Disposable local backend and publishable key required');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('EXPO_PUBLIC_')));
  Object.assign(env, { CI: '1', EXPO_NO_DOTENV: '1', EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_DEV_BYPASS_AUTH: 'false', EXPO_PUBLIC_HITTINGAR_ENABLED: 'true', EXPO_PUBLIC_SUPABASE_URL: local.API_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY, EXPO_PUBLIC_WEBSITE_URL: 'http://127.0.0.1:3001' });
  async function run(name, command, args, captureJson = false) {
    console.log(`Starting ${name}.`);
    const log = fs.createWriteStream(path.join(artifact, `${name}.log`));
    let stdout = '';
    const status = await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: project, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const timer = setTimeout(() => { child.kill(); reject(new Error(`${name} exceeded 15 minutes`)); }, 15 * 60 * 1000);
      child.stdout.on('data', data => { if (captureJson) stdout += data; else log.write(redact(data)); });
      child.stderr.on('data', data => log.write(redact(data)));
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve(code ?? 1); });
    });
    if (captureJson && status === 0) {
      const config = JSON.parse(stdout);
      const summary = { name: config.name, version: config.version, sdkVersion: config.sdkVersion, scheme: config.scheme, iosBundleIdentifier: config.ios?.bundleIdentifier, androidPackage: config.android?.package, plugins: config.plugins, platforms: config.platforms, jsEngine: config.jsEngine ?? 'hermes' };
      log.write(redact(JSON.stringify(summary, null, 2)) + '\n');
    } else if (captureJson) log.write(redact(stdout));
    await new Promise(resolve => log.end(resolve));
    report.checks.push({ name, exitCode: status, log: `artifacts/native/${name}.log` });
    console.log(`${name}: exit ${status}.`);
    return status;
  }
  const configuration = await run('expo-config-prebuild', process.execPath, [cli, 'config', '--type', 'prebuild', '--json'], true);
  const checks = await Promise.all([
    run('expo-native-export', process.execPath, [cli, 'export', '--platform', 'ios', '--platform', 'android', '--output-dir', 'dist-native-check', '--clear']),
    process.platform === 'win32'
      ? run('expo-doctor', process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx --no-install expo-doctor --verbose'])
      : run('expo-doctor', 'npx', ['--no-install', 'expo-doctor', '--verbose'])
  ]);
  function collect(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(filename);
      else if (/\.(hbc|js)$/.test(entry.name)) {
        const bytes = fs.readFileSync(filename);
        report.bundles.push({ path: path.relative(root, filename).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  if (checks[0] === 0) collect(output);
  process.exitCode = configuration || checks.find(code => code !== 0) || 0;
}

try { await main(); }
catch (error) { console.error(redact(error.message)); process.exitCode = 1; report.failure = redact(error.message); }
finally {
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(artifact, 'native-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Sanitized evidence: artifacts/native/native-verification.json');
}
