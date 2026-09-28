import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeMedia } from './media';
const execute = promisify(execFile);
it.skipIf(!process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH)(
  'normalizes real video, produces a thumbnail and removes supplied metadata',
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hittumst-fixture-'));
    try {
      const source = path.join(directory, 'source.mp4');
      await execute(process.env.FFMPEG_PATH!, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=green:s=320x240:d=2',
        '-metadata',
        'title=PRIVATE-FIXTURE',
        '-metadata',
        'location=+64.1-021.9/',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        source,
      ]);
      const result = await normalizeMedia(await readFile(source), 'video');
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.durationMs).toBeLessThanOrEqual(15000);
      expect(result.thumbnail.length).toBeGreaterThan(100);
      const normalized = path.join(directory, 'verified.mp4');
      await writeFile(normalized, result.bytes);
      const probe = await execute(process.env.FFPROBE_PATH!, [
        '-v',
        'error',
        '-show_format',
        '-of',
        'json',
        normalized,
      ]);
      expect(probe.stdout).not.toContain('PRIVATE-FIXTURE');
      expect(probe.stdout).not.toContain('+64.1');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);
