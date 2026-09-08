import { describe, expect, it } from 'vitest';
import { normalizeClaim, privatePushMessages } from '../../../../../supabase/functions/push-worker/payload';

describe('private push payload', () => {
  const fixture = { outboxId: 42, notification: { id: 'notification-id', payload: { body: 'private message', address: 'private address' }, recipientId: 'recipient' }, tokens: [{ tokenId: 'token-id', expoPushToken: 'ExponentPushToken[synthetic]', locale: 'is' }] };
  it('accepts the numeric outbox ID returned by PostgreSQL', () => {
    expect(normalizeClaim([fixture])[0].id).toBe('42');
    expect(normalizeClaim([{ ...fixture, outboxId: '9223372036854775807' }])[0].id).toBe('9223372036854775807');
    expect(() => normalizeClaim([{ ...fixture, outboxId: Number.MAX_SAFE_INTEGER + 1 }])).toThrow();
  });
  it('includes only a notification ID and generic localized text', () => {
    const [claim] = normalizeClaim([fixture]);
    expect(privatePushMessages(claim)).toEqual([{ to: 'ExponentPushToken[synthetic]', title: 'Hittumst', body: 'Þú hefur fengið nýja tilkynningu.', data: { notificationId: 'notification-id' }, sound: 'default', priority: 'default' }]);
    claim.tokens[0].locale = 'en';
    expect(privatePushMessages(claim)[0].body).toBe('You have a new update.');
  });
  it('keeps empty-token claims so the queue can complete them', () => {
    expect(normalizeClaim([{ ...fixture, tokens: [] }])).toEqual([{ id: '42', notificationId: 'notification-id', tokens: [] }]);
  });
});
