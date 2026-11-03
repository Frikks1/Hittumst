import { useEffect, useRef, useState } from 'react';
import { emptyOnboardingDraft, parseOnboardingDraft, type OnboardingDraft } from '@/utils/onboardingDraft';
import { getOnboardingLocalDraft, onboardingDraftGeneration, setOnboardingLocalDraft } from './draftStorage';

export function useOnboardingDraft(accountId: string | undefined, draft: OnboardingDraft, restore: (draft: OnboardingDraft) => void, enabled: boolean) {
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const session = useRef<{ accountId: string; generation: number } | null>(null);
  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    setLoadedAccount(null); setRestored(false); setUnavailable(false);
    restoreRef.current(emptyOnboardingDraft());
    if (!accountId) { session.current = null; return; }
    const entry = { accountId, generation: onboardingDraftGeneration(accountId) };
    session.current = entry;
    void getOnboardingLocalDraft(accountId).then(raw => {
      if (!active) return;
      const value = raw ? parseOnboardingDraft(JSON.parse(raw)) : null;
      if (value) { restoreRef.current(value); setRestored(true); }
    }).catch(() => { if (active) setUnavailable(true); }).finally(() => { if (active) setLoadedAccount(accountId); });
    return () => { active = false; if (session.current === entry) session.current = null; };
  }, [accountId]);
  const serialized = JSON.stringify(draft);
  useEffect(() => {
    const entry = session.current;
    if (!enabled || !accountId || loadedAccount !== accountId || entry?.accountId !== accountId) return;
    const timer = setTimeout(() => {
      void setOnboardingLocalDraft(accountId, serialized, entry.generation)
        .then(() => { if (session.current === entry) setUnavailable(false); })
        .catch(() => { if (session.current === entry) setUnavailable(true); });
    }, 300);
    return () => clearTimeout(timer);
  }, [accountId, enabled, loadedAccount, serialized]);
  return { ready: !!accountId && loadedAccount === accountId, restored, unavailable };
}
