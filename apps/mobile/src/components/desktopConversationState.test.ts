import { describe, expect, it } from 'vitest';
import type { ChatMessage, ConversationSummary } from '@/types/domain';
import { projectConversationMessage, reconcileConversationRead } from './desktopConversationState';

const first = '2026-10-07T10:00:00.000Z';
const second = '2026-10-07T10:01:00.000Z';
const conversation: ConversationSummary = { id: 'conversation', member: { id: 'peer', displayName: 'Peer', photos: [] }, lastMessage: 'First', lastMessageAt: first, unreadCount: 1 };
const message: ChatMessage = { id: 'message', conversationId: conversation.id, senderId: 'peer', kind: 'text', body: 'Second', createdAt: second, status: 'sent' };

describe('desktop conversation state', () => {
  it('keeps a newer unread message when an older read request completes', () => {
    const incoming = projectConversationMessage(conversation, message, '', true);
    const acknowledged = reconcileConversationRead(incoming, first);
    expect(acknowledged).toEqual({ ...conversation, lastMessage: 'Second', lastMessageAt: second, unreadCount: 2 });
    expect(reconcileConversationRead(acknowledged, second).unreadCount).toBe(0);
  });

  it('reconciles stale inbox responses against a confirmed receipt', () => {
    expect(reconcileConversationRead(conversation, first).unreadCount).toBe(0);
    expect(reconcileConversationRead({ ...conversation, lastMessageAt: second }, first).unreadCount).toBe(1);
  });

  it('does not increase unread count for an event already covered by a receipt', () => {
    expect(projectConversationMessage({ ...conversation, unreadCount: 0 }, message, '', true, second).unreadCount).toBe(0);
  });

  it('keeps the latest preview when an older realtime event arrives late', () => {
    const latest = { ...conversation, lastMessage: 'Latest', lastMessageAt: second };
    const projected = projectConversationMessage(latest, { ...message, createdAt: first, body: 'Older' }, '', false);
    expect(projected.lastMessage).toBe('Latest');
    expect(projected.lastMessageAt).toBe(second);
  });

  it('uses localized media previews without marking outgoing messages unread', () => {
    const projected = projectConversationMessage(conversation, { ...message, senderId: 'self', kind: 'image', body: undefined }, 'Image', false);
    expect(projected.lastMessage).toBe('Image');
    expect(projected.unreadCount).toBe(conversation.unreadCount);
  });
});
