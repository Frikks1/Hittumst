import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'expo-router';
import { AppState } from 'react-native';
import { api } from '@/services';
import { hittingarFeature } from '@/features/hittingar/config';
import { readConversationPreferences, subscribeChatLocalState } from '@/utils/chatLocalState';
import type { ConversationSummary, Page } from '@/types/domain';

type InboxValue = { unreadCount: number; refreshUnread: () => void; markReadLocally: (id: string) => void };
const Context = createContext<InboxValue>({ unreadCount: 0, refreshUnread: () => undefined, markReadLocally: () => undefined });

export function ChatInboxProvider({ userId, locationAllowed, children }: { userId: string | null; locationAllowed: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ scope: string; items: Record<string, number> }>({ scope: '', items: {} });
  const [refresh, setRefresh] = useState(0);
  const scope = `${userId}:${locationAllowed}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const localRead = useRef<{ scope: string; revision: number; items: Map<string, number> }>({ scope, revision: 0, items: new Map() });
  if (localRead.current.scope !== scope) localRead.current = { scope, revision: 0, items: new Map() };
  const refreshUnread = useCallback(() => setRefresh(value => value + 1), []);
  const markReadLocally = useCallback((id: string) => {
    localRead.current.items.set(id, ++localRead.current.revision);
    setCounts(value => value.scope === currentScope.current ? { ...value, items: { ...value.items, [id]: 0 } } : value);
  }, []);
  useEffect(() => {
    if (!userId || !locationAllowed) return;
    let active = true; let busy = false; let repeat = false;
    const load = async () => {
      if (!active) return;
      if (busy) { repeat = true; return; }
      busy = true;
      const readRevision = localRead.current.revision;
      try {
        const items: Record<string, number> = {};
        const preferences = await readConversationPreferences(userId);
        let cursor: string | null = null;
        const seen = new Set<string>();
        do {
          const page: Page<ConversationSummary> = await api.listConversations(cursor);
          if (!active || currentScope.current !== scope) return;
          page.items.forEach(item => { items[item.id] = preferences[item.id]?.archived ? 0 : item.unreadCount; });
          cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) throw new Error('conversation_cursor_cycle');
          if (cursor) seen.add(cursor);
        } while (cursor);
        if (hittingarFeature.enabled) {
          const rooms = await api.getMeetupChats();
          rooms.forEach(room => { items[`room:${room.id}`] = room.unreadCount; });
        }
        if (active && currentScope.current === scope) {
          localRead.current.items.forEach((revision, id) => { if (revision > readRevision) items[id] = 0; });
          setCounts({ scope, items });
        }
      } catch { /* Retain the last confirmed count during connection interruptions. */ }
      finally { busy = false; if (repeat && active) { repeat = false; void load(); } }
    };
    void load();
    const appState = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    const unsubscribe = subscribeChatLocalState((owner, kind) => { if (owner === userId && kind === 'preferences') void load(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 15000);
    return () => { active = false; clearInterval(timer); appState.remove(); unsubscribe(); };
  }, [userId, locationAllowed, pathname, refresh, scope]);
  const unreadCount = counts.scope === scope && userId && locationAllowed ? Object.values(counts.items).reduce((sum, value) => sum + value, 0) : 0;
  const value = useMemo(() => ({ unreadCount, refreshUnread, markReadLocally }), [unreadCount, refreshUnread, markReadLocally]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useChatInbox() { return useContext(Context); }
