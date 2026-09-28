import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline retained JVM tests. --sdk additionally exercises the installed, pinned public SDK.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'apps/mobile/plugins/private-native-diagnostics/android');
const taskTempRoot = path.resolve(tmpdir());
const output = mkdtempSync(path.join(taskTempRoot, 'private-native-diagnostics-'));
const withSdk = process.argv.includes('--sdk');
const javaBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : '';
const executable = name => javaBin ? path.join(javaBin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
function run(name, args) {
  const result = spawnSync(executable(name), args, { cwd: root, stdio: 'inherit', timeout: 60_000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${name} failed; install JDK17+ and set JAVA_HOME if needed`);
}
function cached(group, artifact, version) {
  const base = path.join(process.env.GRADLE_USER_HOME || path.join(homedir(), '.gradle'), 'caches/modules-2/files-2.1', group, artifact, version);
  if (!existsSync(base)) throw new Error(`Missing pre-resolved ${group}:${artifact}:${version}; run the normal Android dependency resolution first. This test never downloads dependencies.`);
  for (const hash of readdirSync(base)) for (const name of readdirSync(path.join(base, hash))) {
    if (name.endsWith('.jar') && !name.includes('-sources') && !name.includes('-javadoc')) return path.join(base, hash, name);
  }
  throw new Error(`No installed jar for ${group}:${artifact}:${version}`);
}
try {
  mkdirSync(output, { recursive: true });
  const files = ['PrivateDiagnosticsPolicy.java', 'PrivateDiagnosticsQueue.java', 'tests/PrivateDiagnosticsCoreTest.java'];
  const jars = [];
  if (withSdk) {
    jars.push(cached('io.sentry', 'sentry', '8.57.0'), cached('com.squareup.okhttp3', 'okhttp', '4.9.2'), cached('com.squareup.okio', 'okio', '2.9.0'), cached('org.jetbrains.kotlin', 'kotlin-stdlib', '1.5.31'), cached('org.jetbrains', 'annotations', '13.0'));
    files.push('PrivateDiagnosticsTransportFactory.java', 'PrivateDiagnosticsHttpSender.java', 'tests/PrivateDiagnosticsSdkTest.java');
  }
  const classpath = [output, ...jars].join(path.delimiter);
  run('javac', ['-encoding', 'UTF-8', '-d', output, '-classpath', classpath, ...files.map(file => path.join(source, file))]);
  run('java', ['-classpath', classpath, 'is.rummal.diagnostics.PrivateDiagnosticsCoreTest']);
  if (withSdk) run('java', ['-classpath', classpath, 'is.rummal.diagnostics.PrivateDiagnosticsSdkTest']);
} finally {
  // Only this invocation's mkdtemp directory is removed; never a supplied path.
  const resolvedOutput = path.resolve(output);
  if (path.dirname(resolvedOutput) !== taskTempRoot || !path.basename(resolvedOutput).startsWith('private-native-diagnostics-')) {
    throw new Error('Refusing cleanup outside the task temporary directory');
  }
  rmSync(resolvedOutput, { recursive: true, force: true });
}