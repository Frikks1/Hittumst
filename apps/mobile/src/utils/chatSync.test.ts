import { describe, expect, it, vi } from 'vitest';
import { loadChatCatchup } from './chatSync';
import type { ChatMessage } from '@/types/domain';
const msg = (n: number): ChatMessage => ({ id: String(n).padStart(4, '0'), conversationId: 'chat', senderId: 'peer', body: 'Hello', kind: 'text', status: 'sent', createdAt: new Date(Date.UTC(2026, 8, 8, 0, n)).toISOString() });
describe('chat reconnect history reconciliation', () => {
  it('backfills multiple missed pages before the last confirmed message', async () => {
    const read = vi.fn().mockResolvedValueOnce({ items: [msg(9), msg(8)], nextCursor: 'page2' }).mockResolvedValueOnce({ items: [msg(7), msg(6)], nextCursor: 'page3' }).mockResolvedValueOnce({ items: [msg(5), msg(4)], nextCursor: 'older' });
    const result = await loadChatCatchup(read, msg(5));
    expect(result.items.map(item => item.id)).toEqual(['0004', '0005', '0006', '0007', '0008', '0009']);
    expect(read).toHaveBeenCalledTimes(3); expect(result.nextCursor).toBe('older');
  });
  it('only reads the initial page when there is no previously confirmed message', async () => {
    const read = vi.fn().mockResolvedValue({ items: [msg(9)], nextCursor: 'older' });
    expect((await loadChatCatchup(read)).items).toHaveLength(1); expect(read).toHaveBeenCalledTimes(1);
  });
  it('does not loop forever if a server returns a repeated cursor', async () => {
    const read = vi.fn().mockResolvedValue({ items: [msg(9)], nextCursor: 'same' });
    await expect(loadChatCatchup(read, msg(1))).rejects.toThrow('invalid_message_pagination');
  });
  it('propagates an offline page failure for retry rather than claiming a complete catch-up', async () => {
    const read = vi.fn().mockResolvedValueOnce({ items: [msg(9)], nextCursor: 'older' }).mockRejectedValueOnce(new Error('offline'));
    await expect(loadChatCatchup(read, msg(1))).rejects.toThrow('offline');
  });
});
