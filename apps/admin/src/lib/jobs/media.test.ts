import { expect, it } from 'vitest';
import { inspectMedia } from './media';
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
