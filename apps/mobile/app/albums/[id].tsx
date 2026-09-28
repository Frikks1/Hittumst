import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { confirmAction } from '@/utils/confirmAction';
import { Button, ChoiceChip, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { Album } from '@/types/domain';
import { useEntitlement } from '@/hooks/useEntitlement';

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, theme, locale } = useApp();
  const [album, setAlbum] = useState<Album | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploads,setUploads]=useState<Awaited<ReturnType<typeof api.listMediaUploads>>>([]);
  const { entitlement, limits } = useEntitlement();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const pending = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!id) return;
    const revision = generation.current;
    setLoading(true);
    try {
      const [items, albums] = await Promise.all([api.listMediaUploads(id), api.listMyAlbums()]);
      if (revision !== generation.current) return;
      const next = albums.find(item => item.id === id);
      setUploads(items); setAlbum(next ?? null); setError(!next);
    } catch { if (revision === generation.current) setError(true); }
    finally { if (revision === generation.current) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => {
    generation.current++; void load();
    const timer = setInterval(() => void load(), 25_000);
    return () => { generation.current++; clearInterval(timer); };
  }, [load]));
  const run = async (task: () => Promise<unknown>) => {
    if (pending.current) return;
    const revision = generation.current;
    pending.current = true; setBusy(true); setError(false);
    try { await task(); if (revision === generation.current) await load(); }
    catch { if (revision === generation.current) setError(true); }
    finally { pending.current = false; if (revision === generation.current) setBusy(false); }
  };
  const addMedia = () => run(async () => {
    if (!album || !consent) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9, videoMaxDuration: 15 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const mediaType = asset.type === 'video' ? 'video' : 'image';
    const byteSize = asset.fileSize ?? 0;
    const atPhotoLimit = mediaType === 'image' && album.items.filter(item => item.mediaType === 'image').length >= limits.photos;
    const atVideoLimit = mediaType === 'video' && album.items.filter(item => item.mediaType === 'video').length >= limits.videos;
    if (atPhotoLimit || atVideoLimit || byteSize > 30 * 1024 * 1024 || (mediaType === 'video' && (asset.duration ?? 0) > 15_000)) throw new Error('invalid_album_media');
    await api.addAlbumItem(album.id, { uri: asset.uri, mimeType: asset.mimeType ?? (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'), mediaType, byteSize: byteSize || 1, durationMs: mediaType === 'video' ? asset.duration ?? undefined : undefined });
  });
  const removeItem = (itemId: string) => run(() => api.deleteAlbumItem(itemId));
  const removeAlbum = () => album && confirmAction({ title: t('albums.delete'), message: t('albums.deleteConfirm'), cancelLabel: t('common.cancel'), confirmLabel: t('albums.delete'), destructive: true,
    onConfirm: () => run(async () => { await api.deleteAlbum(album.id); router.back(); }),
  });
  if (!album) return <Screen back title={t('albums.title')}><View style={styles.loading}><Text accessibilityRole={error ? 'alert' : undefined} style={{ color: theme.colors.textMuted }}>{error ? t('privacy.actionFailed') : t('common.loading')}</Text>{error && <Button loading={loading} label={t('common.retry')} onPress={() => void load()} />}</View></Screen>;

  return (
    <Screen back title={album.name}>
      <View style={styles.page}>
        {error && <View><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('privacy.actionFailed')}</Text><Button disabled={busy} loading={loading} variant="secondary" label={t('common.retry')} onPress={() => void load()} /></View>}
        <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('albums.mediaHint')}</Text>
        {uploads.filter(u=>u.status!=='approved').map(upload=><View key={upload.id} style={{gap:8}}><Text style={{color:theme.colors.textMuted}}>{upload.status==='rejected'?(locale==='is'?'Myndefni bíður yfirferðar.':'Media requires review.'):(locale==='is'?'Myndefni er í vinnslu og er ekki sýnilegt öðrum.':'Media is processing and is not visible to others.')}</Text>{upload.status==='rejected'&&<Button variant="secondary" label={locale==='is'?'Óska eftir endurskoðun':'Request review'} disabled={busy} onPress={()=>void run(()=>api.appealMediaUpload(upload.id))}/>}</View>)}
        <ChoiceChip label={t('albums.consent')} selected={consent} onPress={() => setConsent(!consent)} />
        <Text style={{ color: theme.colors.textMuted }}>{album.items.filter(i => i.mediaType === 'image').length}/{limits.photos} {t('albums.photos')} · {album.items.filter(i => i.mediaType === 'video').length}/{limits.videos} {t('albums.video')} · 15 s · 30 MiB</Text>
        <Button icon="add-circle-outline" label={t('albums.addMedia')} disabled={!consent || !entitlement || entitlement.albumsUsed > limits.albums || album.items.length >= limits.photos + limits.videos} loading={busy} onPress={() => void addMedia()} />
        <Button variant="secondary" icon="share-outline" label={t('albums.share')} onPress={() => router.push(`/albums/share?albumId=${album.id}` as never)} />
        <View style={styles.grid}>{album.items.map((item) => <View key={item.id} style={[styles.media, { backgroundColor: theme.colors.surfaceMuted }]}>
          {item.mediaType === 'image' && item.url ? <Image source={item.url} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" /> : <View style={styles.video}><Ionicons name="videocam" size={35} color={theme.colors.textMuted} /><Text style={{ color: theme.colors.textMuted }}>{t('albums.video')}</Text></View>}
          <Pressable disabled={busy} accessibilityLabel={t('albums.delete')} onPress={() => void removeItem(item.id)} style={styles.remove}><Ionicons name="close" size={18} color="#fff" /></Pressable>
        </View>)}</View>
        <View style={[styles.warning, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.accent} /><Text style={{ color: theme.colors.text, flex: 1 }}>{t('albums.safetyWarning')}</Text></View>
        <Button disabled={busy} variant="danger" icon="trash-outline" label={t('albums.delete')} onPress={removeAlbum} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16 }, loading: { minHeight: 400, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, media: { width: '31%', aspectRatio: 0.8, borderRadius: 15, overflow: 'hidden' },
  video: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 }, remove: { position: 'absolute', right: 6, top: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,.75)', alignItems: 'center', justifyContent: 'center' },
  warning: { padding: 14, borderRadius: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
