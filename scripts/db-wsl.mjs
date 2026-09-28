import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { saveGeneratedTypes } from './generated-types.mjs';

const commands = { start: 'supabase start', stop: 'supabase stop', reset: 'supabase db reset --local', baseline: 'supabase db reset --local --version 20260831150105', upgrade: 'supabase migration up --local', test: 'supabase test db', status: 'supabase status', lint: 'supabase db lint --local --schema public,private --level error --fail-on error' };
commands.types = 'supabase gen types typescript --local --schema public,graphql_public';
const command = commands[process.argv[2]];
if (!command) throw new Error('Use start, stop, reset, baseline, upgrade, test, status, lint or types');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const linuxRoot = root.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replaceAll('\\', '/');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const generatingTypes = process.argv[2] === 'types';
let generated = '';
const child = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--', 'sh', '-s'], { stdio: ['pipe', generatingTypes ? 'pipe' : 'inherit', 'inherit'], windowsHide: true });
child.stdin.end(`set -eu\nunset DOCKER_HOST\nexport DOCKER_CONTEXT=default\ncd ${quote(linuxRoot)}\n${command}\n`);
if (generatingTypes) child.stdout.on('data', chunk => {
  generated += chunk.toString('utf8');
  if (generated.length > 25 * 1024 * 1024) child.kill();
});
child.on('error', () => { console.error('Local database command could not start.'); process.exitCode = 1; });
child.on('close', async code => {
  process.exitCode = code ?? 1;
  if (generatingTypes) {
    try {
      await saveGeneratedTypes(path.join(root, 'apps/mobile/src/types/database.ts'), generated, code);
      console.log('Database types updated after successful generation.');
    } catch { console.error('Type generation failed; the previous database.ts is unchanged.'); process.exitCode = 1; }
  }
});
