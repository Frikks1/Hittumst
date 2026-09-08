import type { Page } from '@/types/domain';

export type MessageCursor = { at: string; id: string };
export function decodeMessageCursor(cursor?: string | null): MessageCursor | null {
  if (!cursor) return null;
  const value: unknown = JSON.parse(cursor);
  if (!value || typeof value !== 'object' || !('at' in value) || !('id' in value) ||
      typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at)) || typeof value.id !== 'string') {
    throw new Error('invalid_cursor');
  }
  return { at: value.at, id: value.id };
}

export function pageByTime<T extends { id: string }>(items: T[], time: (item: T) => string, size: number, cursor?: string | null): Page<T> {
  const before = decodeMessageCursor(cursor);
  const sorted = [...items].sort((a, b) => time(b).localeCompare(time(a)) || b.id.localeCompare(a.id));
  const remaining = before ? sorted.filter(item => time(item) < before.at || (time(item) === before.at && item.id < before.id)) : sorted;
  const page = remaining.slice(0, size);
  const last = page.at(-1);
  return { items: page, nextCursor: remaining.length > size && last ? JSON.stringify({ at: time(last), id: last.id }) : null };
}
