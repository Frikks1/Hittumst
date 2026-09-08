import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const commands = { start: 'supabase start', stop: 'supabase stop', reset: 'supabase db reset --local', test: 'supabase test db', status: 'supabase status', lint: 'supabase db lint --local --schema public,private --level error --fail-on error' };
const command = commands[process.argv[2]];
if (!command) throw new Error('Use start, stop, reset, test, status or lint');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const linuxRoot = root.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replaceAll('\\', '/');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const child = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--', 'sh', '-s'], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
child.stdin.end(`set -eu\ncd ${quote(linuxRoot)}\n${command}\n`);
child.on('exit', code => { process.exitCode = code ?? 1; });
