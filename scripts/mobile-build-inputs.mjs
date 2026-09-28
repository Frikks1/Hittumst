// Includes native templates consumed by Expo; generated build output is excluded.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function mobileBuildSourceHash(root) {
  const hash = createHash('sha256');
  function visit(folder) {
    for (const item of fs
      .readdirSync(folder, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(folder, item.name);
      if (item.isDirectory()) visit(name);
      else if (!/\.test\.[cm]?[jt]sx?$/.test(item.name)) {
        hash.update(path.relative(root, name).replaceAll('\\', '/'));
        hash.update(fs.readFileSync(name));
      }
    }
  }
  for (const dir of [
    'apps/mobile/app',
    'apps/mobile/src',
    'apps/mobile/assets',
    'apps/mobile/plugins',
    'apps/mobile/modules',
    'packages/shared/src',
  ])
    if (fs.existsSync(path.join(root, dir))) visit(path.join(root, dir));
  for (const file of [
    'package.json',
    'package-lock.json',
    'packages/shared/package.json',
    'apps/mobile/app.json',
    'apps/mobile/package.json',
    'apps/mobile/babel.config.js',
    'apps/mobile/metro.config.js',
    'apps/mobile/tsconfig.json',
    'scripts/build-demo-apk.mjs',
    'scripts/mobile-build-inputs.mjs',
    'scripts/windows-build-paths.cjs',
  ]) {
    const name = path.join(root, file);
    if (fs.existsSync(name)) {
      hash.update(file);
      hash.update(fs.readFileSync(name));
    }
  }
  return hash.digest('hex');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(mobileBuildSourceHash(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')));
}
