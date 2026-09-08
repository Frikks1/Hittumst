import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ScreenCapture from 'expo-screen-capture';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { AlbumItem, AlbumViewer } from '@/types/domain';

function PrivateVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri, useCaching: false }, (instance) => { instance.loop = true; instance.muted = true; instance.play(); });
  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls />;
}

export default function AlbumViewerScreen() {
  const { id, ownerId } = useLocalSearchParams<{ id: string; ownerId?: string }>();
  const router = useRouter();
  const { t, theme } = useApp();
  const [viewer, setViewer] = useState<AlbumViewer | null>(null);
  const [warningAccepted, setWarningAccepted] = useState(Platform.OS !== 'web');
  const [active, setActive] = useState(0);
  const [reply, setReply] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void ScreenCapture.preventScreenCaptureAsync('private-album-viewer');
    void ScreenCapture.enableAppSwitcherProtectionAsync(0.8);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync('private-album-viewer');
      void ScreenCapture.disableAppSwitcherProtectionAsync();
    };
  }, []);
  useEffect(() => {
    if (!id || !warningAccepted) return;
    void api.openAlbumShare(id).then(setViewer).catch(() => setError(true));
  }, [id, warningAccepted]);
  useEffect(() => () => {
    if (viewer?.sessionId) void api.closeAlbumViewer(viewer.sessionId);
  }, [viewer?.sessionId]);
  const item: AlbumItem | undefined = viewer?.items[active];
  if (!warningAccepted) return <Screen back title={t('albums.title')}><View style={styles.center}><Ionicons name="warning-outline" size={50} color={theme.colors.warning} /><Text style={[textStyles.heading, { color: theme.colors.text, textAlign: 'center' }]}>{t('albums.webWarningTitle')}</Text><Text style={[textStyles.body, { color: theme.colors.textMuted, textAlign: 'center' }]}>{t('albums.webWarningBody')}</Text><Button label={t('albums.webContinue')} onPress={() => setWarningAccepted(true)} /></View></Screen>;
  if (error) return <Screen back title={t('albums.title')}><View style={styles.center}><Ionicons name="lock-closed" size={44} color={theme.colors.textMuted} /><Text style={[textStyles.body, { color: theme.colors.text, textAlign: 'center' }]}>{t('albums.locked')}</Text></View></Screen>;
  if (!viewer || !item) return <Screen back title={viewer?.name ?? t('albums.title')}><View style={styles.center}><Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text></View></Screen>;
  const sendReply = async () => { if (!reply.trim()) return; await api.sendAlbumReply(viewer.shareId, item.id, reply.trim()); setReply(''); };
  const report = () => ownerId && router.push(`/report/${ownerId}?albumShareId=${viewer.shareId}&albumItemId=${item.id}`);
  return <Screen back title={viewer.name}><View style={styles.page}>
    <View style={[styles.frame, { backgroundColor: '#090B0B' }]}>{item.mediaType === 'video' && item.url ? <PrivateVideo uri={item.url} /> : item.url ? <Image source={item.url} style={styles.media} contentFit="contain" cachePolicy="none" /> : null}</View>
    <Text style={[styles.counter, { color: theme.colors.textMuted }]}>{active + 1}/{viewer.items.length}</Text>
    <View style={styles.nav}><Button variant="secondary" label="‹" disabled={active === 0} onPress={() => setActive(Math.max(0, active - 1))} /><Button variant="secondary" label="›" disabled={active === viewer.items.length - 1} onPress={() => setActive(Math.min(viewer.items.length - 1, active + 1))} /></View>
    <View style={styles.actions}><View style={styles.flex}><Button variant="secondary" icon="flame" label="🔥" onPress={() => void api.toggleAlbumReaction(viewer.shareId, item.id)} /></View>{ownerId && <View style={styles.flex}><Button variant="secondary" icon="flag-outline" label={t('albums.report')} onPress={report} /></View>}</View>
    <TextInput value={reply} onChangeText={setReply} placeholder={t('albums.reply')} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
    <Button label={t('common.send')} disabled={!reply.trim()} onPress={() => void sendReply()} />
    <Text style={[styles.safety, { color: theme.colors.textMuted }]}>{t('albums.safetyWarning')}</Text>
  </View></Screen>;
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 }, center: { minHeight: 480, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 16 },
  frame: { width: '100%', aspectRatio: 0.78, borderRadius: 22, overflow: 'hidden' }, media: { width: '100%', height: '100%' },
  counter: { textAlign: 'center', fontWeight: '800' }, nav: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 }, input: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, fontSize: 16 }, safety: { fontSize: 12, lineHeight: 17 },
});
