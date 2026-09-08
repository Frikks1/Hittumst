type Row = Record<string, unknown>;
export type ClaimedOutbox = {
  id: string;
  notificationId: string;
  tokens: { id: string; token: string; locale: 'is' | 'en' }[];
};
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';

export function normalizeClaim(value: unknown): ClaimedOutbox[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const claim = row(entry);
    const rawId = claim.outboxId;
    // PostgreSQL bigint values arrive as JSON numbers. Do not silently discard the claim.
    const id = typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0
      ? String(rawId) : typeof rawId === 'string' && /^[1-9][0-9]*$/.test(rawId) ? rawId : '';
    const notificationId = text(row(claim.notification).id);
    if (!id || !notificationId) throw new Error('Invalid push claim');
    const tokens = (Array.isArray(claim.tokens) ? claim.tokens : []).flatMap((entry) => {
      const token = row(entry);
      const id = text(token.tokenId);
      const value = text(token.expoPushToken);
      return id && value ? [{ id, token: value, locale: token.locale === 'en' ? 'en' as const : 'is' as const }] : [];
    });
    return [{ id, notificationId, tokens }];
  });
}

export function privatePushMessages(claim: ClaimedOutbox) {
  return claim.tokens.slice(0, 100).map((token) => ({
    to: token.token,
    title: 'Hittumst',
    body: token.locale === 'en' ? 'You have a new update.' : 'Þú hefur fengið nýja tilkynningu.',
    data: { notificationId: claim.notificationId },
    sound: 'default',
    priority: 'default',
  }));
}
