import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ChoiceChip, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { defaultFilters, type Album, type AlbumAccessMode, type PublicProfile } from '@/types/domain';

const modes: AlbumAccessMode[] = ['indefinite', 'view_once', '10_minutes', '1_hour', '24_hours'];
const modeKey: Record<AlbumAccessMode, 'albums.indefinite' | 'albums.viewOnce' | 'albums.tenMinutes' | 'albums.oneHour' | 'albums.twentyFourHours'> = {
  indefinite: 'albums.indefinite', view_once: 'albums.viewOnce', '10_minutes': 'albums.tenMinutes', '1_hour': 'albums.oneHour', '24_hours': 'albums.twentyFourHours',
};

export default function ShareAlbumsScreen() {
  const { profileId, albumId, name } = useLocalSearchParams<{ profileId?: string; albumId?: string; name?: string }>();
  const router = useRouter();
  const { t, theme } = useApp();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [selectedAlbums, setSelectedAlbums] = useState<string[]>(albumId ? [albumId] : []);
  const [selectedPeople, setSelectedPeople] = useState<string[]>(profileId ? [profileId] : []);
  const [mode, setMode] = useState<AlbumAccessMode>('indefinite');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    void api.listMyAlbums().then(setAlbums);
    if (!profileId) void api.discover(defaultFilters).then((page) => setProfiles(page.items));
  }, [profileId]);
  useEffect(() => { if (albumId) setSelectedAlbums([albumId]); }, [albumId]);
  useEffect(() => { if (profileId) setSelectedPeople([profileId]); }, [profileId]);
  const toggleAlbum = (id: string) => setSelectedAlbums(selectedAlbums.includes(id) ? selectedAlbums.filter((item) => item !== id) : selectedAlbums.length < 5 ? [...selectedAlbums, id] : selectedAlbums);
  const togglePerson = (id: string) => setSelectedPeople(selectedPeople.includes(id) ? selectedPeople.filter((item) => item !== id) : selectedPeople.length < 5 ? [...selectedPeople, id] : selectedPeople);
  const share = async () => {
    if (!selectedPeople.length || !selectedAlbums.length) return;
    setSending(true);
    try {
      const result = await api.shareAlbums(selectedPeople, selectedAlbums, mode);
      if (profileId && result.conversationId) router.replace(`/chat/${result.conversationId}?name=${encodeURIComponent(name ?? '')}&profileId=${profileId}`);
      else router.replace('/(tabs)/chats');
    } finally { setSending(false); }
  };
  return <Screen back title={t('albums.select')}><View style={styles.page}>
    <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('albums.selectHint')}</Text>
    {albums.length === 0 ? <View style={styles.empty}><Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('albums.empty')}</Text><Button label={t('albums.create')} onPress={() => router.push('/albums' as never)} /></View> : albums.map((album) => <ChoiceChip key={album.id} label={`${album.name} · ${album.items.length}`} selected={selectedAlbums.includes(album.id)} onPress={() => toggleAlbum(album.id)} />)}
    {!profileId && <><Text style={[styles.label, { color: theme.colors.text }]}>{t('albums.selectPeople')}</Text><Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('albums.selectPeopleHint')}</Text><View style={styles.chips}>{profiles.map((profile) => <ChoiceChip key={profile.id} label={profile.displayName} selected={selectedPeople.includes(profile.id)} onPress={() => togglePerson(profile.id)} />)}</View></>}
    <Text style={[styles.label, { color: theme.colors.text }]}>{t('albums.access')}</Text>
    <View style={styles.chips}>{modes.map((item) => <ChoiceChip key={item} label={t(modeKey[item])} selected={mode === item} onPress={() => setMode(item)} />)}</View>
    <View style={[styles.notice, { backgroundColor: theme.colors.accentSoft }]}><Text style={{ color: theme.colors.text }}>{t('albums.safetyWarning')}</Text></View>
    <Button label={t('albums.share')} disabled={!selectedAlbums.length || !selectedPeople.length} loading={sending} onPress={() => void share()} />
  </View></Screen>;
}

const styles = StyleSheet.create({ page: { padding: 20, gap: 14 }, label: { fontWeight: '900', marginTop: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, notice: { padding: 14, borderRadius: 16 }, empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 } });
