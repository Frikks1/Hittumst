import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from '@/services';
import { readChatDrafts, readConversationPreferences, setConversationPreference, subscribeChatLocalState, type ConversationPreference, type ConversationPreferences } from '@/utils/chatLocalState';

type PreferenceState = {
  ownerId?: string; drafts: Record<string, string>; preferences: ConversationPreferences; muted: string[];
  localError: boolean; remoteError: boolean; operationError: boolean; pending: string | null; ready: boolean;
};
const emptyState = (ownerId?: string): PreferenceState => ({ ownerId, drafts: {}, preferences: {}, muted: [], localError: false, remoteError: false, operationError: false, pending: null, ready: false });

export function useConversationPreferences(ownerId: string | undefined) {
  const current = useRef(ownerId); current.current = ownerId;
  const busy = useRef(false);
  const [state, setState] = useState<PreferenceState>(() => emptyState());
  const revision = useRef(0);
  const mutedRevision = useRef(0);
  const load = useCallback(async (refreshMuted = true) => {
    const version = ++revision.current;
    if (!ownerId) return;
    const local = Promise.allSettled([readChatDrafts(ownerId), readConversationPreferences(ownerId)]).then(([drafts, preferences]) => {
      if (current.current !== ownerId || version !== revision.current) return;
      setState(previous => {
        const value = previous.ownerId === ownerId ? previous : emptyState(ownerId);
        return { ...value, ready: true, localError: drafts.status === 'rejected' || preferences.status === 'rejected',
          drafts: drafts.status === 'fulfilled' ? drafts.value : value.drafts,
          preferences: preferences.status === 'fulfilled' ? preferences.value : value.preferences,
        };
      });
    });
    // Draft updates must not discard an in-flight server mute refresh.
    const remoteVersion = refreshMuted ? ++mutedRevision.current : mutedRevision.current;
    const remote = refreshMuted ? api.getNotificationPreferences().then(notifications => {
      if (current.current !== ownerId || remoteVersion !== mutedRevision.current) return;
      setState(previous => ({ ...(previous.ownerId === ownerId ? previous : emptyState(ownerId)), muted: notifications.mutedConversationIds, remoteError: false }));
    }).catch(() => {
      if (current.current !== ownerId || remoteVersion !== mutedRevision.current) return;
      setState(previous => ({ ...(previous.ownerId === ownerId ? previous : emptyState(ownerId)), remoteError: true }));
    }) : Promise.resolve();
    await Promise.all([local, remote]);
  }, [ownerId]);
  useEffect(() => {
    busy.current = false;
    void load();
    const unsubscribe = subscribeChatLocalState(id => { if (id === ownerId) void load(false); });
    return () => { revision.current++; mutedRevision.current++; unsubscribe(); };
  }, [load, ownerId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const update = async (id: string, patch: ConversationPreference | { muted: boolean }) => {
    if (!ownerId || current.current !== ownerId || busy.current) return;
    busy.current = true; setState(value => ({ ...(value.ownerId === ownerId ? value : emptyState(ownerId)), pending: id, operationError: false }));
    revision.current++;
    try {
      if ('muted' in patch) {
        mutedRevision.current++;
        await api.setConversationMuted(id, patch.muted);
        if (current.current === ownerId) setState(value => ({ ...value, muted: patch.muted ? [...new Set([...value.muted, id])] : value.muted.filter(entry => entry !== id) }));
      }
      else await setConversationPreference(ownerId, id, patch);
      if (current.current !== ownerId) return;
      await load();
    } catch {
      if (current.current === ownerId) setState(value => ({ ...value, operationError: true }));
    } finally {
      if (current.current === ownerId) { busy.current = false; setState(value => ({ ...value, pending: null })); }
    }
  };
  const value = state.ownerId === ownerId ? state : emptyState(ownerId);
  return { ...value, error: value.localError || value.remoteError || value.operationError, update };
}
