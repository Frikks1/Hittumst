// Opt-in local-only runner. Discovers localhost keys in memory; never loads .env.local.
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let status;
try {
if (process.platform === 'win32') {
  const linuxRoot = root.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replaceAll('\\', '/');
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  status = execFileSync('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--', 'sh', '-s'], {
    input: `cd ${quote(linuxRoot)}\nsupabase status -o json\n`, encoding:'utf8', timeout:45000,
    windowsHide:true, stdio:['pipe','pipe','pipe'],
  });
} else status = execFileSync('supabase', ['status','-o','json'], { cwd:root, encoding:'utf8', timeout:45000, stdio:['ignore','pipe','pipe'] });
} catch { throw new Error('Local Supabase status is unavailable. Start the disposable local stack first.'); }
let config;
try { config = JSON.parse(status.slice(status.indexOf('{'))); } catch { throw new Error('Local Supabase returned invalid status data.'); }
const api = new URL(config.API_URL);
const database = new URL(config.DB_URL);
if (api.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(api.hostname) || api.port !== '54321' || api.username || api.password || api.pathname !== '/' || api.search || api.hash ||
    !['postgres','postgresql'].includes(database.protocol.slice(0,-1)) || !['localhost','127.0.0.1'].includes(database.hostname) || database.port !== '54322' || database.pathname !== '/postgres' || database.username !== 'postgres') throw new Error('This integration runner only permits the disposable local Supabase stack on ports 54321/54322.');
const key = config.PUBLISHABLE_KEY;
const secret = config.SECRET_KEY;
if (!/^sb_publishable_/.test(key ?? '') || !/^sb_secret_/.test(secret ?? '')) throw new Error('Local modern publishable/secret API keys are required.');
await mkdir(path.join(root,'tmp'), { recursive:true });
const child = spawn(process.execPath, [path.join(root,'node_modules/vitest/vitest.mjs'), 'run', '--config', 'scripts/vitest-media-export.config.mts', '--reporter=default', '--reporter=json', '--outputFile=tmp/media-export-integration.json'], {
  cwd:root, windowsHide:true, stdio:'inherit', env:{ ...process.env,
    MEDIA_EXPORT_LOCAL_TESTS:'synthetic-only', NEXT_PUBLIC_SUPABASE_URL:api.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key, SUPABASE_SECRET_KEY:secret,
    MEDIA_EXPORT_LOCAL_DB_URL:database.toString(), HITTUMST_APP_ENV:'development',
    MEMBER_WEB_ORIGINS:'http://localhost:8081',
  },
});
child.on('exit', code => { process.exitCode = code ?? 1; });
