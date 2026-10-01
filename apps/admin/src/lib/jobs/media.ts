import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const execute = promisify(execFile);
const probeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      duration: z.string().optional(),
    }),
  ),
  format: z.object({ duration: z.string().optional(), format_name: z.string() }),
});
export type MediaLimits = { maxBytes: number; maxDurationMs: number | null };
const albumLimits: MediaLimits = { maxBytes: 30 * 1024 * 1024, maxDurationMs: 15000 };
export function inspectMedia(probe: unknown, kind: 'image' | 'video', bytes: number, limits: MediaLimits = albumLimits) {
  const data = probeSchema.parse(probe);
  const video = data.streams.filter((s) => s.codec_type === 'video');
  if (
    bytes < 1 ||
    bytes > limits.maxBytes ||
    video.length !== 1 ||
    data.streams.some((s) => !['video', 'audio'].includes(s.codec_type))
  )
    throw new Error('invalid_media');
  const stream = video[0]!;
  if (!stream.width || !stream.height || stream.width * stream.height > 40_000_000)
    throw new Error('invalid_dimensions');
  const duration = Math.ceil(Number(data.format.duration ?? stream.duration ?? 0) * 1000);
  if (kind === 'video' && (!Number.isFinite(duration) || duration < 1 || (limits.maxDurationMs !== null && duration > limits.maxDurationMs)))
    throw new Error('invalid_duration');
  if (
    kind === 'image' &&
    (!/^(image2|jpeg_pipe|png_pipe|webp_pipe)$/.test(data.format.format_name) ||
      data.streams.length !== 1)
  )
    throw new Error('invalid_image');
  return {
    durationMs: kind === 'video' ? duration : null,
    width: stream.width,
    height: stream.height,
  };
}
export async function normalizeMedia(input: Uint8Array, kind: 'image' | 'video', limits: MediaLimits = albumLimits) {
  if (input.byteLength < 1 || input.byteLength > limits.maxBytes) throw new Error('invalid_media');
  const directory = await mkdtemp(path.join(tmpdir(), 'hittumst-media-'));
  try {
    const source = path.join(directory, 'source');
    const output = path.join(directory, kind === 'image' ? 'normalized.jpg' : 'normalized.mp4');
    const thumb = path.join(directory, 'thumbnail.jpg');
    await writeFile(source, input, { mode: 0o600 });
    const ffprobe = process.env.FFPROBE_PATH;
    if (!ffprobe || !process.env.FFMPEG_PATH) throw new Error('processor_unavailable');
    const probe = await execute(
      ffprobe,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm,image2,jpeg_pipe,png_pipe,webp_pipe,gif',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        source,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const metadata = inspectMedia(JSON.parse(probe.stdout), kind, input.byteLength, limits);
    const common = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-protocol_whitelist',
      'file,pipe',
      '-format_whitelist',
      'mov,matroska,webm,image2,jpeg_pipe,png_pipe,webp_pipe,gif',
      '-i',
      source,
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
    ];
    const args =
      kind === 'image'
        ? ['-frames:v', '1', '-vf', "scale=w='min(2048,iw)':h='min(2048,ih)':force_original_aspect_ratio=decrease", '-q:v', '3']
        : [
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-vf',
            "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
            '-r',
            '30',
            '-c:a',
            'aac',
            '-movflags',
            '+faststart',
          ];
    await execute(process.env.FFMPEG_PATH, [...common, ...args, output], {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    await execute(
      process.env.FFMPEG_PATH,
      [...common, '-frames:v', '1', '-vf', "scale='min(400,iw)':-2", '-q:v', '4', thumb],
      { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const size = (await stat(output)).size;
    if (size > limits.maxBytes) throw new Error('normalized_media_too_large');
    const verified = await execute(
      ffprobe,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm,image2,jpeg_pipe,png_pipe,webp_pipe,gif',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        output,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const finalMetadata = inspectMedia(JSON.parse(verified.stdout), kind, size, limits);
    return {
      bytes: await readFile(output),
      thumbnail: await readFile(thumb),
      ...metadata,
      ...finalMetadata,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
