import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, EmptyState, Screen, TrustBanner } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { MeetupRoomMessage, MeetupRoomSummary } from '@/types/domain';

export default function HittingurRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  return <RoomSession key={`${id}:${user?.id}`} id={user ? id : undefined} />;
}

function mergeRoomMessages(current: MeetupRoomMessage[], incoming: MeetupRoomMessage[]) {
  return [...new Map([...current, ...incoming].map(message => [message.id, message])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function RoomSession({ id }: { id?: string }) {
  const { t, theme } = useApp();
  const [room, setRoom] = useState<MeetupRoomSummary | null>(null);
  const [messages, setMessages] = useState<MeetupRoomMessage[]>([]);
  const [body, setBody] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [error, setError] = useState<'load' | 'send' | null>(null);
  const [reload, setReload] = useState(0);
  const active = useRef(false);
  const sendBusy = useRef(false);
  const olderBusy = useRef(false);
  const revision = useRef(0);
  const pending = useRef<{ id: string; body: string } | null>(null);
  useFocusEffect(useCallback(() => {
    setRoom(null); setMessages([]); setCursor(null); setLoading(Boolean(id));
    if (!id) return;
    active.current = true;
    let unsubscribe = () => {};
    let subscribedRoom: string | null = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (!active.current || AppState.currentState !== 'active') return;
      const request = ++revision.current;
      try {
        const value = await api.getMeetupRoom(id);
        const page = value && !value.isPaused ? await api.listMeetupRoomMessages(value.id) : null;
        if (!active.current || request !== revision.current) return;
        setRoom(value); setMessages(page?.items ?? []); setCursor(page?.nextCursor ?? null); setError(null);
        clearTimeout(deadline);
        if (value) {
          const closes = value.canPost ? value.postingClosesAt : value.readingClosesAt;
          deadline = setTimeout(() => { void refresh(); }, Math.min(2_147_000_000, Math.max(100, Date.parse(closes) - Date.now() + 100)));
          if (subscribedRoom !== value.id) {
            unsubscribe(); subscribedRoom = value.id;
            unsubscribe = api.subscribeMeetupRoom(value.id, () => { void refresh(); });
          }
        } else { unsubscribe(); subscribedRoom = null; }
      } catch {
        if (active.current && request === revision.current) {
          setRoom(null); setMessages([]); setCursor(null); setError('load');
        }
      } finally {
        if (active.current && request === revision.current) setLoading(false);
      }
    };
    void refresh();
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') { setLoading(true); void refresh(); }
      else { ++revision.current; clearTimeout(deadline); setRoom(null); setMessages([]); setCursor(null); }
    });
    return () => { active.current = false; ++revision.current; clearTimeout(deadline); unsubscribe(); state.remove(); };
  }, [id, reload]));

  const loadOlder = async () => {
    if (!room || !cursor || olderBusy.current) return;
    const request = revision.current;
    olderBusy.current = true; setOlderLoading(true);
    try {
      const page = await api.listMeetupRoomMessages(room.id, cursor);
      if (active.current && request === revision.current) { setMessages(current => mergeRoomMessages(current, page.items)); setCursor(page.nextCursor); }
    } catch {
      if (active.current && request === revision.current) { setRoom(null); setMessages([]); setError('load'); }
    } finally { olderBusy.current = false; if (active.current) setOlderLoading(false); }
  };
  const send = async () => {
    if (!room?.canPost || room.isPaused || !body.trim() || sendBusy.current) return;
    const attempt = pending.current?.body === body.trim() ? pending.current : { id: Crypto.randomUUID(), body: body.trim() };
    pending.current = attempt; sendBusy.current = true; setSending(true); setError(null);
    try {
      const message = await api.sendMeetupRoomMessage(room.id, attempt.body, attempt.id);
      if (active.current && AppState.currentState === 'active') {
        setMessages(current => mergeRoomMessages(current, [message])); setBody(''); pending.current = null;
      }
    } catch { if (active.current) setError('send'); }
    finally { sendBusy.current = false; if (active.current) setSending(false); }
  };
  const openHost = (hostname: string) => Alert.alert(t('hittingar.room.externalTitle'), t('hittingar.room.externalBody', { hostname }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('hittingar.room.openLink'), onPress: () => { const match = messages.flatMap((item) => item.body.match(/https?:\/\/[^\s<>{}"']+/gi) ?? []).find((url) => { try { return new URL(url).hostname === hostname; } catch { return false; } }); if (match) void Linking.openURL(match); } },
  ]);
  return <Screen back title={t('hittingar.room.title')}>
    <View style={styles.page}>
      <TrustBanner icon="chatbubbles-outline" title={t('hittingar.room.privateTitle')} body={t('hittingar.room.lifecycle')} />
      {loading && <ActivityIndicator accessibilityLabel={t('common.loading')} color={theme.colors.accent} />}
      {error && <><Text accessibilityRole="alert" style={{ color: theme.colors.text }}>{t('common.error')}</Text>{error === 'load' && <Button label={t('common.retry')} onPress={() => setReload(value => value + 1)} />}</>}
      {!room && !loading && !error ? <EmptyState icon="lock-closed-outline" title={t('hittingar.room.unavailable')} body={t('hittingar.room.unavailableBody')} /> : room && <>
        {room.isPaused && <TrustBanner icon="pause-circle-outline" title={t('hittingar.room.paused')} body={t('hittingar.room.pausedBody')} />}
        {cursor && <Button label={olderLoading ? t('common.loading') : t('chat.older')} disabled={olderLoading} onPress={() => void loadOlder()} />}
        <View style={styles.messages}>{messages.map((message) => <View key={message.id} style={[styles.message, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sender, { color: theme.colors.text }]}>{message.sender?.displayName ?? t('hittingar.room.system')}</Text>
          <Text style={{ color: theme.colors.text }}>{message.body}</Text>
          {message.linkHostnames.map((hostname) => <Pressable key={hostname} onPress={() => openHost(hostname)} style={styles.link}><Ionicons name="open-outline" size={16} color={theme.colors.warning} /><Text style={{ color: theme.colors.warning, fontWeight: '800' }}>{hostname}</Text></Pressable>)}
        </View>)}</View>
        {messages.length === 0 && <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>{t('hittingar.room.empty')}</Text>}
        <TextInput value={body} onChangeText={setBody} accessibilityLabel={t('hittingar.room.placeholder')} maxLength={2000} editable={room.canPost && !room.isPaused && !sending} multiline placeholder={room.canPost ? t('hittingar.room.placeholder') : t('hittingar.room.closed')} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} />
        <Button icon="send" label={sending ? t('common.loading') : error === 'send' ? t('common.retry') : t('common.send')} disabled={!room.canPost || room.isPaused || !body.trim() || sending} onPress={() => void send()} />
      </>}
    </View>
  </Screen>;
}
const styles = StyleSheet.create({ page: { padding: 18, gap: 14 }, messages: { gap: 8 }, message: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, gap: 6 }, sender: { fontWeight: '900' }, link: { flexDirection: 'row', alignItems: 'center', gap: 6 }, input: { minHeight: 76, borderWidth: 1, borderRadius: 16, padding: 12, textAlignVertical: 'top' } });
