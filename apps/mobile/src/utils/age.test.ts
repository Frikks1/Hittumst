import { describe, expect, it } from 'vitest';
import { calculateAge, isAtLeast18, parseDateOnly } from './age';

describe('age gate', () => {
  const today = new Date('2026-08-31T12:00:00.000Z');

  it('accepts someone on their eighteenth birthday', () => {
    expect(isAtLeast18('2008-08-31', today)).toBe(true);
    expect(calculateAge('2008-08-31', today)).toBe(18);
  });

  it('rejects someone one day before their eighteenth birthday', () => {
    expect(isAtLeast18('2008-09-01', today)).toBe(false);
  });

  it('rejects impossible and non-ISO dates', () => {
    expect(parseDateOnly('2020-02-30')).toBeNull();
    expect(parseDateOnly('31/08/2000')).toBeNull();
  });
});
