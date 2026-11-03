import { useEffect, useRef, useState } from 'react';
import { api } from '@/services';
import { sharedConversationInterests } from '@/utils/chatStarters';

export function useSharedChatStarters(ownerId: string | undefined, peerId: string | undefined, locationAllowed: boolean) {
  return useChatProfileContext(ownerId, peerId, locationAllowed).interests;
}

/** Fetch private reply context under the current account; keep prompt text out of URLs. */
export function useChatProfileContext(ownerId: string | undefined, peerId: string | undefined, locationAllowed: boolean) {
  const key = `${ownerId}:${peerId}:${locationAllowed}`;
  const current = useRef(key); current.current = key;
  const [state, setState] = useState<{ key: string; interests: string[]; prompt: string }>({ key: '', interests: [], prompt: '' });
  useEffect(() => {
    if (!ownerId || !peerId || !locationAllowed) return;
    let active = true;
    void Promise.all([api.getOwnProfile(), api.getProfile(peerId)]).then(([own, peer]) => {
      if (active && current.current === key && own.id === ownerId && peer.id === peerId) setState({ key, interests: sharedConversationInterests(own, peer), prompt: peer.conversationPrompt ?? '' });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [key, ownerId, peerId, locationAllowed]);
  return state.key === key ? state : { key, interests: [], prompt: '' };
}
