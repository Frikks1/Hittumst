import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, stat, readdir } from 'node:fs/promises';
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
      nb_read_frames: z.string().optional(),
    }),
  ),
  format: z.object({ duration: z.string().optional(), format_name: z.string() }),
});
export type MediaLimits = { maxBytes: number; maxDurationMs: number | null; allowAnimatedImages?: boolean };
export type NormalizedMedia = {
  bytes: Buffer; thumbnail: Buffer; width: number; height: number; durationMs: number | null;
  contentType?: 'image/jpeg' | 'image/gif' | 'video/mp4'; moderationFrames?: Buffer[];
};
export const profileGifLimits = { maxDurationMs: 15000, maxFrames: 150 };
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
    ((!/^(image2|jpeg_pipe|png_pipe|webp_pipe)$/.test(data.format.format_name) && !(limits.allowAnimatedImages && data.format.format_name === 'gif')) ||
      data.streams.length !== 1)
  )
    throw new Error('invalid_image');
  if (data.format.format_name === 'gif') {
    const frames = Number(stream.nb_read_frames);
    if (!Number.isFinite(duration) || duration < 1 || duration > profileGifLimits.maxDurationMs ||
      !Number.isInteger(frames) || frames < 1 || frames > profileGifLimits.maxFrames) throw new Error('invalid_animation');
  }
  return {
    durationMs: kind === 'video' ? duration : null,
    width: stream.width,
    height: stream.height,
  };
}
export async function normalizeMedia(input: Uint8Array, kind: 'image' | 'video', limits: MediaLimits = albumLimits): Promise<NormalizedMedia> {
  if (input.byteLength < 1 || input.byteLength > limits.maxBytes) throw new Error('invalid_media');
  const signature = Buffer.from(input.subarray(0, 6)).toString('ascii');
  if (signature === 'GIF87a' || signature === 'GIF89a') {
    if (kind !== 'image' || !limits.allowAnimatedImages) throw new Error('invalid_image');
    return normalizeProfileGif(input, limits);
  }
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
        'mov,matroska,webm,image2,jpeg_pipe,png_pipe,webp_pipe',
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
      'mov,matroska,webm,image2,jpeg_pipe,png_pipe,webp_pipe',
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
        'mov,matroska,webm,image2,jpeg_pipe,png_pipe,webp_pipe',
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

/** Decode a finite loop, re-encode without metadata, and review every displayed frame. */
async function normalizeProfileGif(input: Uint8Array, limits: MediaLimits): Promise<NormalizedMedia> {
  const ffmpeg = process.env.FFMPEG_PATH;
  const ffprobe = process.env.FFPROBE_PATH;
  if (!ffmpeg || !ffprobe) throw new Error('processor_unavailable');
  const directory = await mkdtemp(path.join(tmpdir(), 'hittumst-gif-'));
  try {
    const source = path.join(directory, 'source.gif');
    const output = path.join(directory, 'normalized.gif');
    const thumb = path.join(directory, 'thumbnail.jpg');
    await writeFile(source, input, { mode: 0o600 });
    const probe = async (file: string, bytes: number) => {
      const result = await execute(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-format_whitelist', 'gif', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file],
      { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
      const data = probeSchema.parse(JSON.parse(result.stdout));
      return { ...inspectMedia(data, 'image', bytes, limits), frames: Number(data.streams[0]!.nb_read_frames) };
    };
    const original = await probe(source, input.byteLength);
    const common = (file: string) => ['-hide_banner', '-loglevel', 'error', '-nostdin',
      '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'gif', '-ignore_loop', '1', '-i', file,
      '-map_metadata', '-1', '-map_chapters', '-1'];
    await execute(ffmpeg, [...common(source), '-filter_complex',
      "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:flags=lanczos,split[frames][colors];[colors]palettegen=stats_mode=single[palette];[frames][palette]paletteuse=new=1",
      '-fps_mode', 'passthrough', '-frames:v', String(profileGifLimits.maxFrames + 1), '-loop', '0', output],
    { timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true });
    const size = (await stat(output)).size;
    if (size > limits.maxBytes) throw new Error('normalized_media_too_large');
    const verified = await probe(output, size);
    if (verified.frames !== original.frames) throw new Error('invalid_animation');
    await execute(ffmpeg, [...common(output), '-frames:v', '1', '-vf', "scale='min(400,iw)':-2", '-q:v', '4', thumb],
      { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
    await execute(ffmpeg, [...common(output), '-fps_mode', 'passthrough', '-frames:v', String(profileGifLimits.maxFrames + 1),
      '-q:v', '3', path.join(directory, 'frame-%04d.jpg')],
    { timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true });
    const files = (await readdir(directory)).filter(file => /^frame-\d{4}\.jpg$/.test(file)).sort();
    if (files.length !== verified.frames) throw new Error('invalid_animation');
    const moderationFrames: Buffer[] = [];
    let frameBytes = 0;
    for (const file of files) {
      const location = path.join(directory, file);
      const bytes = (await stat(location)).size;
      frameBytes += bytes;
      // Rekognition images must fit its bytes API; bound decoded animation memory too.
      if (bytes < 1 || bytes > 5 * 1024 * 1024 || frameBytes > 64 * 1024 * 1024) throw new Error('invalid_animation');
      moderationFrames.push(await readFile(location));
    }
    return { bytes: await readFile(output), thumbnail: await readFile(thumb), width: verified.width,
      height: verified.height, durationMs: null, contentType: 'image/gif', moderationFrames };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
