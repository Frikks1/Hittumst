import type { ChatMessage } from '@/types/domain';
export const MESSAGE_LIMIT = 2000;
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const existing = messages.get(message.id);
    // A late failure must not overwrite a confirmed realtime delivery.
    if (existing?.status === 'sent' && message.status !== 'sent') continue;
    messages.set(message.id, message);
  }
  return [...messages.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function validMessageBody(body: string): boolean {
  const length = Array.from(body.trim()).length;
  return length > 0 && length <= MESSAGE_LIMIT;
}
