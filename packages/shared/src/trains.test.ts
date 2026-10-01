import { describe, expect, it } from 'vitest';
import { allocateTrainPool, locationShareInput, trainSettingsSchema, type TrainDetail } from './trains';

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
  const pool: TrainDetail['pool'] = { enabled: true, amountPerEvent: 500, monthlyCap: 1000, balance: 1500, sandbox: true, allocations: [] };
  it('allocates once per event even when more members join the plan', () => {
    const first = allocateTrainPool(pool, 'event', 0);
    expect(first.balance).toBe(1000);
    expect(allocateTrainPool(first, 'event', 500)).toEqual(first);
    expect(pool.balance).toBe(1500);
  });
  it('does not overspend, exceed the monthly cap or allocate while disabled', () => {
    expect(allocateTrainPool({ ...pool, balance: 400 }, 'event', 0).allocations).toEqual([]);
    expect(allocateTrainPool(pool, 'event', 750)).toEqual(pool);
    expect(allocateTrainPool({ ...pool, enabled: false }, 'event', 0).allocations).toEqual([]);
  });
});
