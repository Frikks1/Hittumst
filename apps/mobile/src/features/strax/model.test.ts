import { describe, expect, it } from 'vitest';
import {
  initialStraxForm,
  straxAnchoredNow,
  straxInput,
  straxIsActive,
  straxMinutesLeft,
} from './model';

describe('Strax form and foreground lifecycle', () => {
  it('accepts DM-only descriptions and optional fields, with application approval by default', () => {
    const input = straxInput({
      ...initialStraxForm,
      title: '  One more player  ',
      description: ' DM me for more info. ',
    });
    expect(input).toMatchObject({
      title: 'One more player',
      description: 'DM me for more info.',
      joinMode: 'application',
      spacesNeeded: null,
      requirements: null,
      address: null,
    });
  });
  it('rejects missing required text and malformed capacities instead of silently parsing them', () => {
    expect(straxInput({ ...initialStraxForm, title: ' ', description: 'DM me' })).toBeNull();
    expect(straxInput({ ...initialStraxForm, title: 'Game', description: ' ' })).toBeNull();
    for (const capacity of ['0', '51', '-1', '1.5', '2 people'])
      expect(
        straxInput({ ...initialStraxForm, title: 'Game', description: 'DM me', capacity }),
      ).toBeNull();
    expect(
      straxInput({ ...initialStraxForm, title: 'Game', description: 'DM me', capacity: '1' })
        ?.spacesNeeded,
    ).toBe(1);
  });
  it('never carries an old in-person address into an online activity', () => {
    expect(
      straxInput({
        ...initialStraxForm,
        title: 'Game',
        description: 'DM me',
        venueMode: 'online',
        address: 'Old address',
      })?.address,
    ).toBeNull();
  });
  it('advances from a server anchor even if the device wall clock is wrong or changes', () => {
    const anchor = { server: Date.parse('2026-10-13T12:00:00Z'), monotonic: 1000 };
    expect(straxAnchoredNow(anchor, 61_000, Date.parse('2028-01-01T00:00:00Z'))).toBe(
      Date.parse('2026-10-13T12:01:00Z'),
    );
    expect(straxAnchoredNow(anchor, 61_000, 0)).toBe(Date.parse('2026-10-13T12:01:00Z'));
  });
  it('removes activity and disables participation at the exact four-hour boundary', () => {
    const expiry = Date.parse('2026-10-13T16:00:00Z');
    const item = { status: 'active', expiresAt: '2026-10-13T16:00:00Z' };
    expect(straxIsActive(item, expiry - 1)).toBe(true);
    expect(straxIsActive(item, expiry)).toBe(false);
    expect(straxMinutesLeft(item.expiresAt, expiry)).toBe(0);
    expect(straxIsActive({ ...item, status: 'closed' }, expiry - 60_000)).toBe(false);
  });
});
