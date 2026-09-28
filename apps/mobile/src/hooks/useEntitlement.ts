import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { type Entitlement, TIERS } from '@rummal/shared';
import { api } from '@/services';
import { useApp } from '@/providers/AppProvider';

export function useEntitlement() {
  const { user } = useApp();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [error, setError] = useState(false);
  const account = useRef(user?.id);
  account.current = user?.id;
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const generation = ++revision.current;
    const id = user?.id;
    setError(false);
    if (!id && !api.isDemo) { setEntitlement(null); return; }
    try {
      const next = await api.getEntitlement();
      if (generation === revision.current && id === account.current) setEntitlement(next);
    } catch {
      if (generation === revision.current && id === account.current) { setEntitlement(null); setError(true); }
    }
  }, [user?.id]);
  useFocusEffect(useCallback(() => {
    setEntitlement(null);
    void reload();
    return () => { revision.current += 1; };
  }, [reload]));
  return { entitlement, limits: TIERS[entitlement?.tier ?? 'plebbi'], error, reload };
}
