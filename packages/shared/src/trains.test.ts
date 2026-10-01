import { describe, expect, it } from 'vitest';
import { locationShareInput, trainSettingsSchema } from './trains';

describe('train privacy and pool rules', () => {
  it('creates private trains unless explicitly published', () => {
    expect(trainSettingsSchema.parse({ name: 'Friends' }).visibility).toBe('private');
  });
  it('requires valid precise coordinates, recipients and bounded duration', () => {
    expect(() => locationShareInput(64, -22, 15, [])).toThrow();
    expect(() => locationShareInput(91, -22, 15, null)).toThrow();
    expect(() => locationShareInput(64, -22, 600, null)).toThrow();
    expect(locationShareInput(64, -22, 60, ['member']).recipients).toEqual(['member']);
  });
});
