import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, EmptyState, Screen, TrustBanner, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { Album } from '@/types/domain';

export default function AlbumsScreen() {
  const router = useRouter();
  const { t, theme } = useApp();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => void api.listMyAlbums().then(setAlbums), []);
  useFocusEffect(load);
  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try { const album = await api.createAlbum(name); setName(''); router.push(`/albums/${album.id}` as never); } finally { setCreating(false); }
  };
  return (
    <Screen back title={t('albums.title')}>
      <View style={styles.page}>
        <TrustBanner icon="lock-closed-outline" title={t('albums.title')} body={t('albums.emptyBody')} />
        <View style={[styles.createCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <TextInput value={name} onChangeText={setName} maxLength={40} placeholder={t('albums.name')} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
          <Button label={t('albums.create')} disabled={!name.trim() || albums.length >= 10} loading={creating} onPress={() => void create()} />
          <Text style={[styles.count, { color: theme.colors.textMuted }]}>{albums.length}/10</Text>
        </View>
        {albums.length === 0 ? <EmptyState icon="images-outline" title={t('albums.empty')} body={t('albums.emptyBody')} /> : albums.map((album) => (
          <Pressable key={album.id} onPress={() => router.push(`/albums/${album.id}` as never)} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="images-outline" size={25} color={theme.colors.accent} /></View>
            <View style={styles.copy}><Text style={[styles.name, { color: theme.colors.text }]}>{album.name}</Text><Text style={{ color: theme.colors.textMuted }}>{album.items.filter((item) => item.mediaType === 'image').length} {t('albums.photos')} · {album.items.some((item) => item.mediaType === 'video') ? `1 ${t('albums.video')}` : `0 ${t('albums.video')}`}</Text></View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14 }, createCard: { gap: 10, padding: 14, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth }, input: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 },
  count: { textAlign: 'right', fontWeight: '800' }, empty: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 12 },
  card: { minHeight: 82, borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 4 }, name: { fontSize: 17, fontWeight: '900' },
});
