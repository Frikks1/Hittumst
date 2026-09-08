import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, ChoiceChip, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { Album } from '@/types/domain';

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, theme } = useApp();
  const [album, setAlbum] = useState<Album | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => id && void api.listMyAlbums().then((albums) => setAlbum(albums.find((item) => item.id === id) ?? null));
  useEffect(() => { load(); }, [id]);
  const addMedia = async () => {
    if (!album || !consent) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9, videoMaxDuration: 15 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const mediaType = asset.type === 'video' ? 'video' : 'image';
    const byteSize = asset.fileSize ?? 0;
    const atPhotoLimit = mediaType === 'image' && album.items.filter((item) => item.mediaType === 'image').length >= 10;
    const atVideoLimit = mediaType === 'video' && album.items.some((item) => item.mediaType === 'video');
    if (atPhotoLimit || atVideoLimit || byteSize > 30 * 1024 * 1024 || (mediaType === 'video' && (asset.duration ?? 0) > 15_000)) return Alert.alert(t('albums.uploadInvalid'));
    setBusy(true);
    try { await api.addAlbumItem(album.id, { uri: asset.uri, mimeType: asset.mimeType ?? (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'), mediaType, byteSize: byteSize || 1, durationMs: mediaType === 'video' ? asset.duration ?? undefined : undefined }); load(); } finally { setBusy(false); }
  };
  const removeItem = async (itemId: string) => { await api.deleteAlbumItem(itemId); load(); };
  const removeAlbum = () => album && Alert.alert(t('albums.delete'), t('albums.deleteConfirm'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('albums.delete'), style: 'destructive', onPress: () => void api.deleteAlbum(album.id).then(() => router.back()) },
  ]);
  if (!album) return <Screen back title={t('albums.title')}><View style={styles.loading}><Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text></View></Screen>;
  return (
    <Screen back title={album.name}>
      <View style={styles.page}>
        <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('albums.mediaHint')}</Text>
        <ChoiceChip label={t('albums.consent')} selected={consent} onPress={() => setConsent(!consent)} />
        <Button icon="add-circle-outline" label={t('albums.addMedia')} disabled={!consent || album.items.length >= 11} loading={busy} onPress={() => void addMedia()} />
        <Button variant="secondary" icon="share-outline" label={t('albums.share')} onPress={() => router.push(`/albums/share?albumId=${album.id}` as never)} />
        <View style={styles.grid}>{album.items.map((item) => <View key={item.id} style={[styles.media, { backgroundColor: theme.colors.surfaceMuted }]}>
          {item.mediaType === 'image' && item.url ? <Image source={item.url} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" /> : <View style={styles.video}><Ionicons name="videocam" size={35} color={theme.colors.textMuted} /><Text style={{ color: theme.colors.textMuted }}>{t('albums.video')}</Text></View>}
          <Pressable accessibilityLabel={t('albums.delete')} onPress={() => void removeItem(item.id)} style={styles.remove}><Ionicons name="close" size={18} color="#fff" /></Pressable>
        </View>)}</View>
        <View style={[styles.warning, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.accent} /><Text style={{ color: theme.colors.text, flex: 1 }}>{t('albums.safetyWarning')}</Text></View>
        <Button variant="danger" icon="trash-outline" label={t('albums.delete')} onPress={removeAlbum} />
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
