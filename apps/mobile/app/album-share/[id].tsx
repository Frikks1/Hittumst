import { Text, TextInput } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import * as ScreenCapture from 'expo-screen-capture';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { AlbumItem, AlbumViewer } from '@/types/domain';
import { createAlbumViewerSession } from '@/utils/albumViewerSession';

function PrivateVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri, useCaching: false }, instance => { instance.loop = true; instance.muted = true; instance.play(); });
  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls />;
}

export default function AlbumViewerScreen() {
  const { id, ownerId } = useLocalSearchParams<{ id: string; ownerId?: string }>();
  const router = useRouter();
  const { t, theme, user } = useApp();
  const [viewer, setViewer] = useState<AlbumViewer | null>(null);
  const [captureReady, setCaptureReady] = useState(Platform.OS === 'web');
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [opened, setOpened] = useState(false);
  const [active, setActive] = useState(0);
  const [reply, setReply] = useState('');
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (Platform.OS === 'web') return () => { mounted.current = false; };
    let current = true;
    void (async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync('private-album-viewer');
        if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync(0.8);
        if (current) setWarningAccepted(true);
      } catch { /* Require the visible capture warning acknowledgement if protection is unavailable. */ }
      finally { if (current) setCaptureReady(true); }
    })();
    return () => {
      current = false; mounted.current = false;
      void ScreenCapture.allowScreenCaptureAsync('private-album-viewer').catch(() => undefined);
      if (Platform.OS === 'ios') void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    if (!id) return;
    let current = true;
    let foreground = AppState.currentState === 'active' || Platform.OS === 'web';
    let hasOpened = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const session = createAlbumViewerSession(api, id, Crypto.randomUUID());
    setViewer(null); setOpened(false); setError(false); setActive(0); setReply('');
    const load = async () => {
      if (!current || !foreground) return;
      hasOpened = true; setOpened(true); setLoading(true); setError(false);
      try {
        const next = await session.load();
        if (!current || !foreground) return;
        clearTimeout(expiryTimer);
        const expiry = Math.min(Date.parse(next.urlsExpireAt ?? '') || Infinity, Date.parse(next.accessExpiresAt ?? '') || Infinity);
        if (expiry <= Date.now()) throw new Error('album_share_locked');
        setViewer(next); setActive(index => Math.min(index, Math.max(0, next.items.length - 1)));
        if (Number.isFinite(expiry)) expiryTimer = setTimeout(() => { if (current) { setViewer(null); void load(); } }, Math.max(0, expiry - Date.now()));
      } catch { if (current) { setViewer(null); setError(true); } }
      finally { if (current) setLoading(false); }
    };
    loadRef.current = load;
    const interval = setInterval(() => { if (hasOpened && foreground) void load(); }, 25_000);
    const subscription = AppState.addEventListener('change', state => {
      foreground = state === 'active';
      if (!foreground) setViewer(null);
      else if (hasOpened) void load();
    });
    return () => { current = false; session.dispose(); clearInterval(interval); clearTimeout(expiryTimer); subscription.remove(); };
  }, [id, user?.id]);
  const action = async (task: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError(false);
    try { await task(); } catch { if (mounted.current) setActionError(true); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const item: AlbumItem | undefined = viewer?.items[active];
  if (!captureReady) return <Screen back><Text>{t('common.loading')}</Text></Screen>;
  if (!warningAccepted) return <Screen back title={t('albums.title')}><View style={styles.center}><Ionicons name="warning-outline" size={50} color={theme.colors.warning} /><Text style={[textStyles.heading, { color: theme.colors.text, textAlign: 'center' }]}>{t('albums.webWarningTitle')}</Text><Text style={[textStyles.body, { color: theme.colors.textMuted, textAlign: 'center' }]}>{t('albums.webWarningBody')}</Text><Button label={t('albums.webContinue')} onPress={() => setWarningAccepted(true)} /></View></Screen>;
  if (!viewer || !item) return <Screen back title={viewer?.name ?? t('albums.title')}><View style={styles.center}><Text accessibilityRole={error ? 'alert' : undefined} style={{ color: theme.colors.text }}>{error ? t('albums.locked') : viewer ? t('albums.empty') : opened ? t('common.loading') : t('albums.safetyWarning')}</Text>{(!opened || error) && <Button loading={loading} label={error ? t('common.retry') : t('albums.open')} onPress={() => void loadRef.current()} />}</View></Screen>;
  const sendReply = () => action(async () => { if (!reply.trim()) return; await api.sendAlbumReply(viewer.shareId, item.id, reply.trim()); if (mounted.current) setReply(''); });
  const report = () => ownerId && router.push(('/report/' + ownerId + '?albumShareId=' + viewer.shareId + '&albumItemId=' + item.id) as never);
  return <Screen back title={viewer.name}><View style={styles.page}>
    <View style={[styles.frame, { backgroundColor: '#090B0B' }]}>{item.mediaType === 'video' && item.url ? <PrivateVideo uri={item.url} /> : item.url ? <Image source={item.url} style={styles.media} contentFit="contain" cachePolicy="none" onError={() => setActionError(true)} /> : null}</View>
    <Text style={[styles.counter, { color: theme.colors.textMuted }]}>{active + 1}/{viewer.items.length}</Text>
    <View style={styles.nav}><Button variant="secondary" label="‹" disabled={active === 0} onPress={() => setActive(Math.max(0, active - 1))} /><Button variant="secondary" label="›" disabled={active === viewer.items.length - 1} onPress={() => setActive(Math.min(viewer.items.length - 1, active + 1))} /></View>
    {actionError && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('privacy.actionFailed')}</Text>}
    <View style={styles.actions}><View style={styles.flex}><Button disabled={busy} variant="secondary" icon="flame" label="🔥" onPress={() => void action(() => api.toggleAlbumReaction(viewer.shareId, item.id))} /></View>{ownerId && <View style={styles.flex}><Button variant="secondary" icon="flag-outline" label={t('albums.report')} onPress={report} /></View>}</View>
    <TextInput accessibilityLabel={t('albums.reply')} maxLength={2000} editable={!busy} value={reply} onChangeText={setReply} placeholder={t('albums.reply')} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
    <Button label={t('common.send')} loading={busy} disabled={!reply.trim()} onPress={() => void sendReply()} />
    <Text style={[styles.safety, { color: theme.colors.textMuted }]}>{t('albums.safetyWarning')}</Text>
  </View></Screen>;
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 }, center: { minHeight: 480, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 16 },
  frame: { width: '100%', aspectRatio: 0.78, borderRadius: 22, overflow: 'hidden' }, media: { width: '100%', height: '100%' },
  counter: { textAlign: 'center', fontWeight: '800' }, nav: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 }, input: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, fontSize: 16 }, safety: { fontSize: 12, lineHeight: 17 },
});
