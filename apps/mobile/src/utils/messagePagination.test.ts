import { describe, expect, it } from 'vitest';
import { decodeMessageCursor, pageByTime } from './messagePagination';

describe('chat pagination', () => {
  it('visits every message once when a page boundary has equal timestamps', () => {
    const rows = Array.from({ length: 125 }, (_, i) => ({ id: String(i).padStart(4, '0'), at: '2026-09-07T12:00:00.000Z' }));
    const first = pageByTime(rows, row => row.at, 50);
    const second = pageByTime(rows, row => row.at, 50, first.nextCursor);
    const third = pageByTime(rows, row => row.at, 50, second.nextCursor);
    expect([first.items.length, second.items.length, third.items.length]).toEqual([50, 50, 25]);
    expect(new Set([...first.items, ...second.items, ...third.items].map(row => row.id)).size).toBe(125);
    expect(third.nextCursor).toBeNull();
    expect(first.items[0]?.id).toBe('0124');
  });
  it('does not disturb older history when a new message arrives', () => {
    const rows = [{ id: '1', at: '2026-09-01T12:00:00Z' }, { id: '2', at: '2026-09-02T12:00:00Z' }];
    const first = pageByTime(rows, row => row.at, 1);
    rows.push({ id: '3', at: '2026-09-03T12:00:00Z' });
    expect(pageByTime(rows, row => row.at, 1, first.nextCursor).items.map(row => row.id)).toEqual(['1']);
  });
  it('rejects malformed cursors before sending a request', () => {
    for (const value of ['not-json', '{}', '{"at":"yesterday","id":"1"}', '{"at":"2026-09-01","id":1}']) {
      expect(() => decodeMessageCursor(value)).toThrow();
    }
  });
});
