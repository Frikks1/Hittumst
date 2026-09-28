import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
/** A failed/empty generator must never truncate the checked-in schema. */
export async function saveGeneratedTypes(target, output, exitCode) {
  if (exitCode !== 0 || typeof output !== 'string' || !/^export type Database\s*=/m.test(output) || output.length > 25 * 1024 * 1024)
    throw new Error('database_type_generation_failed');
  const temporary = path.join(path.dirname(target), `.database-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, output, { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
}
