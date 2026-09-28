import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { authStorage } from '@/services/secureStorage';
import { parseDiscoveryFilters, parseSavedFilters, type SavedDiscoveryFilter } from '@/utils/discoveryPreferences';
import type { DiscoveryFilters } from '@/types/domain';

export function useSavedFilters(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<{ userId?: string; items: SavedDiscoveryFilter[]; ready: boolean }>({ items: [], ready: false });
  const current = useRef(snapshot);
  const account = useRef(userId);
  account.current = userId;
  const pending = useRef(false);
  const [storageError, setStorageError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    pending.current = false;
    const initial = { userId, items: [], ready: false };
    current.current = initial; setSnapshot(initial); setStorageError(false);
    if (!userId) return;
    void authStorage.getItem(`discovery.${userId}`).then(value => {
      if (!active) return;
      let items: SavedDiscoveryFilter[] = [];
      try { items = parseSavedFilters(value ? JSON.parse(value) : []); } catch { /* Discard malformed saved filters. */ }
      current.current = { userId, items, ready: true }; setSnapshot(current.current);
    }).catch(() => { if (active) setStorageError(true); });
    return () => { active = false; };
  }, [userId, reload]);
  const write = useCallback(async (change: (items: SavedDiscoveryFilter[]) => SavedDiscoveryFilter[]) => {
    if (!userId || account.current !== userId || current.current.userId !== userId || !current.current.ready || pending.current) throw new Error('filters_not_ready');
    pending.current = true;
    try {
      const items = change(current.current.items);
      await authStorage.setItem(`discovery.${userId}`, JSON.stringify(items));
      if (account.current === userId) { current.current = { userId, items, ready: true }; setSnapshot(current.current); setStorageError(false); }
    } catch (error) { if (account.current === userId) setStorageError(true); throw error; }
    finally { if (account.current === userId) pending.current = false; }
  }, [userId]);
  return {
    savedFilters: snapshot.userId === userId ? snapshot.items : [],
    savedFiltersReady: snapshot.userId === userId && snapshot.ready,
    savedFiltersError: storageError,
    retrySavedFilters: () => setReload(value => value + 1),
    saveFilter: (name: string, filters: DiscoveryFilters) => write(items => {
      const label = name.trim().slice(0, 40);
      if (!label || items.length >= 5) throw new Error('invalid_saved_filter');
      return [...items, { id: Crypto.randomUUID(), name: label, filters: { ...parseDiscoveryFilters(filters), diagnosisIds: [] } }];
    }),
    removeFilter: (id: string) => write(items => items.filter(item => item.id !== id)),
  };
}
