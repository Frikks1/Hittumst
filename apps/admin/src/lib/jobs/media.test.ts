import { expect, it } from 'vitest';
import { inspectMedia, normalizeMedia } from './media';
it('uses decoded content, rejects mislabeled videos and duration overflow', () => {
  const probe = {
    streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
    format: { duration: '15', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
  };
  expect(inspectMedia(probe, 'video', 1000).durationMs).toBe(15000);
  expect(() => inspectMedia(probe, 'image', 1000)).toThrow();
  expect(() =>
    inspectMedia({ ...probe, format: { ...probe.format, duration: '15.01' } }, 'video', 1000),
  ).toThrow();
  expect(() =>
    inspectMedia(
      { ...probe, streams: [{ codec_type: 'video', width: 100000, height: 100000 }] },
      'video',
      1000,
    ),
  ).toThrow();
});
it('accepts decoded bounded GIF loops only for animated profile photos', () => {
  const probe = { streams: [{ codec_type: 'video', width: 320, height: 240, nb_read_frames: '150' }], format: { duration: '15', format_name: 'gif' } };
  const limits = { maxBytes: 10 * 1024 * 1024, maxDurationMs: null, allowAnimatedImages: true };
  expect(inspectMedia(probe, 'image', 100, limits)).toEqual({ durationMs: null, width: 320, height: 240 });
  expect(() => inspectMedia(probe, 'image', 100)).toThrow('invalid_image');
  expect(() => inspectMedia({ ...probe, streams: [{ ...probe.streams[0], nb_read_frames: '151' }] }, 'image', 100, limits)).toThrow('invalid_animation');
  expect(() => inspectMedia({ ...probe, format: { ...probe.format, duration: '15.01' } }, 'image', 100, limits)).toThrow('invalid_animation');
  expect(() => inspectMedia({ ...probe, streams: [{ ...probe.streams[0], nb_read_frames: 'N/A' }] }, 'image', 100, limits)).toThrow('invalid_animation');
});
it('rejects a GIF signature before decoding if the media target does not allow animation', async () => {
  await expect(normalizeMedia(Buffer.from('GIF89a'), 'image')).rejects.toThrow('invalid_image');
  await expect(normalizeMedia(Buffer.from('GIF87a'), 'video', { maxBytes: 10, maxDurationMs: null, allowAnimatedImages: true })).rejects.toThrow('invalid_image');
});
