import { describe, expect, it } from 'vitest';
import { STRAX_LIFETIME_MS, straxCreateInputSchema, straxIsActive, straxServerNow, groupMessageSchema } from '../src';

describe('Strax contracts', () => {
  it('supports a compact description and defaults to applications without planned times', () => {
    expect(straxCreateInputSchema.parse({ title: 'Leikur', description: 'DM me for more info' })).toMatchObject({ joinMode: 'application', venueMode: 'in_person', spacesNeeded: null });
    expect(straxCreateInputSchema.safeParse({ title: 'Leikur', description: '', startsAt: '2026-10-13' }).success).toBe(false);
    expect(straxCreateInputSchema.safeParse({ title: 'x'.repeat(61), description: 'DM me' }).success).toBe(false);
    expect(straxCreateInputSchema.safeParse({ title: 'Leikur', description: 'DM me', spacesNeeded: 0 }).success).toBe(false);
  });
  it('expires at the server deadline even across midnight and corrects an incorrect device clock', () => {
    const start = Date.parse('2026-10-13T23:00:00Z');
    expect(new Date(start + STRAX_LIFETIME_MS).toISOString()).toBe('2026-10-14T03:00:00.000Z');
    const now = straxServerNow('2026-10-13T23:00:00Z', 100, 100 + STRAX_LIFETIME_MS);
    expect(straxIsActive({ status: 'active', expiresAt: '2026-10-14T03:00:00Z' }, now - 1)).toBe(true);
    expect(straxIsActive({ status: 'active', expiresAt: '2026-10-14T03:00:00Z' }, now)).toBe(false);
  });
  it('allows a structured group share without weakening ordinary message validation', () => {
    const row = { id: '81000000-0000-4000-8000-000000000001', groupId: '81000000-0000-4000-8000-000000000002', senderId: 'host', senderName: 'Aron', body: 'Strax', createdAt: '2026-10-13T12:00:00Z', strax: { id: 'activity', title: 'Leikur', expiresAt: '2026-10-13T16:00:00Z' } };
    expect(groupMessageSchema.parse(row).strax?.id).toBe('activity');
    expect(groupMessageSchema.safeParse({ ...row, strax: { id: 'activity' } }).success).toBe(false);
  });
});
