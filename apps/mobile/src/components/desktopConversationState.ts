import type { ChatMessage, ConversationSummary } from '@/types/domain';

export function reconcileConversationRead(item: ConversationSummary, through?: string): ConversationSummary {
  return through && Date.parse(item.lastMessageAt) <= Date.parse(through) ? { ...item, unreadCount: 0 } : item;
}

export function projectConversationMessage(item: ConversationSummary, message: ChatMessage, fallback: string, incoming: boolean, readThrough?: string): ConversationSummary {
  const unreadCount = item.unreadCount + (incoming && (!readThrough || Date.parse(message.createdAt) > Date.parse(readThrough)) ? 1 : 0);
  if (Date.parse(message.createdAt) < Date.parse(item.lastMessageAt)) return { ...item, unreadCount };
  return { ...item, unreadCount, lastMessage: message.body ?? fallback, lastMessageAt: message.createdAt };
}
