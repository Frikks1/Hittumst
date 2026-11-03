import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { chatAccountGeneration, readChatDrafts, saveChatDraft } from '@/utils/chatLocalState';

export function useChatDraft(ownerId: string | undefined, conversationId: string, initial = '') {
  const key = `${ownerId ?? ''}:${conversationId}`;
  const currentKey = useRef(key); currentKey.current = key;
  const [state, setState] = useState({ key, value: '', error: false });
  const [readyKey, setReadyKey] = useState('');
  const session = useRef<{ key: string; value: string; edited: boolean; ready: boolean; generation: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    if (!ownerId || !conversationId) return;
    let active = true;
    const entry = { key, value: '', edited: false, ready: false, generation: chatAccountGeneration(ownerId), timer: undefined as ReturnType<typeof setTimeout> | undefined };
    session.current = entry;
    setState({ key, value: '', error: false }); setReadyKey('');
    const persist = () => {
      if (!entry.ready && !entry.edited) return;
      void saveChatDraft(ownerId, conversationId, entry.value, entry.generation).then(() => {
        if (active && currentKey.current === key) setState(value => ({ ...value, error: false }));
      }).catch(() => { if (active && currentKey.current === key) setState(value => ({ ...value, error: true })); });
    };
    void readChatDrafts(ownerId).then(drafts => {
      if (!active || currentKey.current !== key) return;
      entry.ready = true;
      if (!entry.edited) { entry.value = drafts[conversationId] || initial; setState({ key, value: entry.value, error: false }); }
      setReadyKey(key);
      if (entry.edited || (!drafts[conversationId] && initial)) persist();
    }).catch(() => {
      if (!active || currentKey.current !== key) return;
      entry.ready = true; setReadyKey(key); setState(value => ({ ...value, error: true }));
    });
    const appState = AppState.addEventListener('change', value => { if (value !== 'active') { clearTimeout(entry.timer); persist(); } });
    return () => { active = false; clearTimeout(entry.timer); persist(); appState.remove(); if (session.current === entry) session.current = null; };
  }, [key, ownerId, conversationId, initial]);
  const setDraft = useCallback((value: string) => {
    const entry = session.current;
    if (!ownerId || !entry || entry.key !== key) return;
    entry.value = value; entry.edited = true; setState({ key, value, error: false }); clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      void saveChatDraft(ownerId, conversationId, entry.value, entry.generation).catch(() => {
        if (currentKey.current === key) setState(current => ({ ...current, error: true }));
      });
    }, value ? 350 : 0);
  }, [ownerId, conversationId, key]);
  return { draft: state.key === key ? state.value : '', setDraft, draftError: state.key === key && state.error, draftReady: readyKey === key };
}
