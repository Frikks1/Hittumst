import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = 'apps/admin/dist-worker/worker.mjs';
await build({
  absWorkingDir: root,
  entryPoints: ['apps/admin/src/worker.ts'],
  outfile: entry,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  alias: { '@': './apps/admin/src', '@rummal/shared': './packages/shared/src/index.ts' },
  sourcemap: false,
  logLevel: 'warning',
});
if (process.argv.includes('--package-runtime')) {
  // Next may bundle packages which the independent worker imports directly.
  // Explicitly trace the worker instead of assuming Next standalone contains them.
  const { nodeFileTrace } = createRequire(import.meta.url)('next/dist/compiled/@vercel/nft');
  const traced = await nodeFileTrace([path.join(root, entry)], { base: root, processCwd: root });
  const unexpectedWarnings = [...traced.warnings].filter((warning) => {
    const message = warning.message.replaceAll('\\', '/');
    return (
      !(
        /Failed to resolve dependency "__(?:SENTRY_WRAPPING_TARGET_FILE|SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM)__"/.test(
          message,
        ) && message.includes('/@sentry/nextjs/build/cjs/config/templates/')
      ) &&
      !(
        process.platform !== 'darwin' &&
        /Failed to resolve dependency "fsevents"/.test(message) &&
        message.includes('/rollup/dist/shared/fsevents-importer.js')
      )
    );
  });
  if (unexpectedWarnings.length) throw new Error('unresolved_worker_runtime_dependencies');
  const destination = path.resolve(root, 'apps/admin/dist-worker/runtime');
  if (
    path.relative(path.resolve(root), destination) !==
    path.join('apps', 'admin', 'dist-worker', 'runtime')
  )
    throw new Error('invalid_worker_output');
  for (const file of traced.fileList) {
    if (
      path.isAbsolute(file) ||
      file.split(/[\\/]/).includes('..') ||
      path.basename(file).startsWith('.env') ||
      /\.(pem|p8|p12|key|keystore|jks)$/i.test(file)
    )
      throw new Error('unsafe_worker_dependency_path');
  }
  // This exact generated output directory is the only recursive deletion target.
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of traced.fileList) {
    const source = path.join(root, file),
      target = path.join(destination, file);
    await mkdir(path.dirname(target), { recursive: true });
    const info = await stat(source);
    await cp(source, target, { recursive: info.isDirectory(), dereference: true });
  }
  console.log(
    JSON.stringify({
      scope: 'worker-runtime-pack',
      files: traced.fileList.size,
      warnings: traced.warnings.size,
    }),
  );
}
