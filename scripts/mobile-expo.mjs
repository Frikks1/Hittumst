import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(root, 'apps', 'mobile');
const require = createRequire(path.join(project, 'package.json'));
const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin', 'cli');
// The CLI's Node-side router tools must resolve the workspace's installed peer.
// Metro still uses the project's existing resolver and native dependency graph.
const nodePath = [path.join(project, 'node_modules'), path.join(root, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: project, env: { ...process.env, NODE_PATH: nodePath }, stdio: 'inherit',
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
