import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve:{ alias:{ '@':fileURLToPath(new URL('../apps/admin/src', import.meta.url)) } },
  test:{ environment:'node', include:['scripts/integration/media-export.integration.ts'], hookTimeout:60000, testTimeout:30000, fileParallelism:false },
});
