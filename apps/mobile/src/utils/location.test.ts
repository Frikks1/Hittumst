import { describe, expect, it } from 'vitest';
import { evaluateLocationFix, isLocationFresh, isPlausiblyInIceland } from './location';

describe('foreground Iceland location gate', () => {
  const now = new Date('2026-08-31T12:00:00.000Z');

  it('accepts a fresh, accurate Reykjavik fix', () => {
    expect(evaluateLocationFix({ latitude: 64.1466, longitude: -21.9426, accuracy: 18, capturedAt: now }, now)).toBe('ok');
  });

  it('rejects an outside, stale, or imprecise fix', () => {
    expect(isPlausiblyInIceland(51.5072, -0.1276)).toBe(false);
    expect(evaluateLocationFix({ latitude: 64.1, longitude: -21.9, accuracy: 10, capturedAt: new Date('2026-08-31T11:40:00Z') }, now)).toBe('too_old');
    expect(evaluateLocationFix({ latitude: 64.1, longitude: -21.9, accuracy: 5000, capturedAt: now }, now)).toBe('poor_accuracy');
  });

  it('expires verification at fifteen minutes', () => {
    expect(isLocationFresh('2026-08-31T11:45:01.000Z', now)).toBe(true);
    expect(isLocationFresh('2026-08-31T11:45:00.000Z', now)).toBe(false);
  });
});
