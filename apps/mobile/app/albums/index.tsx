import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useEntitlement } from '@/hooks/useEntitlement';
import { Button, EmptyState, Field, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { Album, AlbumShare } from '@/types/domain';

export default function AlbumsScreen() {
  const router = useRouter();
  const { t, theme, locale, user } = useApp();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [shares, setShares] = useState<AlbumShare[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { entitlement, limits } = useEntitlement();
  const revision = useRef(0);
  const busy = useRef(false);
  useFocusEffect(useCallback(() => {
    const current = ++revision.current;
    setLoading(true); setError(false); setOwner(null); setAlbums([]); setShares([]); setPending(null); setCreating(false);
    if (!user) { setLoading(false); return; }
    void Promise.allSettled([api.listMyAlbums(), api.listAlbumShares()]).then(([own, shared]) => {
      if (current !== revision.current) return;
      setAlbums(own.status === 'fulfilled' ? own.value : []);
      setShares(shared.status === 'fulfilled' ? shared.value : []);
      setError(own.status === 'rejected' || shared.status === 'rejected');
      setOwner(user.id); setLoading(false);
    });
    return () => { revision.current++; };
  }, [user?.id, attempt]));
  const create = async () => {
    if (!name.trim() || busy.current || !user || owner !== user.id) return;
    const current = revision.current;
    busy.current = true; setCreating(true); setError(false);
    try { const album = await api.createAlbum(name.trim()); if (current === revision.current) { setName(''); router.push(`/albums/${album.id}`); } }
    catch { if (current === revision.current) setError(true); }
    finally { busy.current = false; if (current === revision.current) setCreating(false); }
  };
  const action = async (share: AlbumShare, operation: 'accept' | 'decline' | 'revoke') => {
    if (busy.current) return;
    const current = revision.current;
    busy.current = true; setPending(share.id); setError(false);
    try {
      if (operation === 'revoke') await api.revokeAlbumShare(share.id);
      else await api.respondToAlbumShare(share.id, operation === 'accept');
      if (current !== revision.current) return;
      if (operation === 'accept') router.push(`/album-share/${share.id}?ownerId=${share.ownerId}`);
      else setAttempt(value => value + 1);
    } catch { if (current === revision.current) setError(true); }
    finally { busy.current = false; if (current === revision.current) setPending(null); }
  };
  const visibleShares = owner === user?.id ? shares : [];
  const shareRows = (incoming: boolean) => visibleShares.filter(share => share.isIncoming === incoming).map(share => <View key={share.id} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <View style={styles.row}><Ionicons name="lock-closed-outline" size={23} color={theme.colors.accent} /><View style={styles.copy}><Text style={[styles.name, { color: theme.colors.text }]}>{share.albumName}</Text><Text style={{ color: theme.colors.textMuted }}>{t(`albums.${share.status}`)}</Text></View></View>
    {incoming && share.status === 'pending' && <View style={styles.actions}><Button disabled={Boolean(pending)} loading={pending === share.id} label={t('albums.accept')} onPress={() => void action(share, 'accept')} /><Button variant="ghost" disabled={Boolean(pending)} label={t('albums.decline')} onPress={() => void action(share, 'decline')} /></View>}
    {incoming && share.status === 'accepted' && <Button variant="secondary" disabled={Boolean(pending)} label={t('albums.open')} onPress={() => router.push(`/album-share/${share.id}?ownerId=${share.ownerId}`)} />}
    {!incoming && ['pending', 'accepted', 'consumed'].includes(share.status) && <Button variant="ghost" disabled={Boolean(pending)} loading={pending === share.id} label={t('albums.revoke')} onPress={() => void action(share, 'revoke')} />}
  </View>);
  return <Screen back title={t('albums.title')}><View style={styles.page}>
    {error && <View style={styles.card}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('privacy.actionFailed')}</Text><Button variant="secondary" label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} /></View>}
    {loading ? <ActivityIndicator color={theme.colors.accent} /> : <>
      <Text style={[styles.heading, { color: theme.colors.textMuted }]}>{locale === 'is' ? 'Albúmin mín' : 'My albums'}</Text>
      {owner === user?.id && albums.map(album => <Pressable key={album.id} accessibilityRole="link" onPress={() => router.push(`/albums/${album.id}`)} style={[styles.card, styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Ionicons name="images-outline" size={25} color={theme.colors.accent} /><View style={styles.copy}><Text style={[styles.name, { color: theme.colors.text }]}>{album.name}</Text><Text style={{ color: theme.colors.textMuted }}>{album.items.length} {locale === 'is' ? 'myndir og myndskeið' : 'photos and videos'}</Text></View><Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} /></Pressable>)}
      {!albums.length && !error && <EmptyState icon="images-outline" title={t('albums.empty')} />}
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Field label={t('albums.name')} value={name} onChangeText={setName} maxLength={40} /><Button label={t('albums.create')} disabled={!entitlement || !name.trim() || albums.length >= limits.albums || Boolean(pending)} loading={creating} onPress={() => void create()} /><Text style={{ color: theme.colors.textMuted }}>{albums.length}/{limits.albums}</Text></View>
      <Text style={[styles.heading, { color: theme.colors.textMuted }]}>{locale === 'is' ? 'Deilt með mér' : 'Shared with me'}</Text>
      {shareRows(true)}
      {!visibleShares.some(share => share.isIncoming) && <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Engum albúmum hefur verið deilt með þér enn.' : 'No albums have been shared with you yet.'}</Text>}
      {visibleShares.some(share => !share.isIncoming) && <><Text style={[styles.heading, { color: theme.colors.textMuted }]}>{locale === 'is' ? 'Deilt af mér' : 'Shared by me'}</Text>{shareRows(false)}</>}
    </>}
  </View></Screen>;
}
const styles = StyleSheet.create({ page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, gap: 14 }, heading: { textTransform: 'uppercase', fontSize: 13, fontWeight: '700', marginTop: 12 }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1, gap: 4 }, name: { fontSize: 16, fontWeight: '700' }, actions: { flexDirection: 'row', gap: 10 } });
