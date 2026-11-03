import { Text, TextInput } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button, EmptyState, Screen, TrustBanner } from '@/components/ui';
import { RoomAvatar, RoomMediaPreview, RoomMembers } from '@/features/hittingar/RoomChat';
import { meetupRoomChatCopy } from '@/i18n/meetupRoomChat';
import { useApp } from '@/providers/AppProvider';
import { useChatInbox } from '@/providers/ChatInboxProvider';
import { api } from '@/services';
import type { MeetupRoomMember, MeetupRoomMessage, MeetupRoomMessagePage, MeetupRoomSummary } from '@/types/domain';
import { confirmAction } from '@/utils/confirmAction';
import { prepareRoomMessageLink } from '@/utils/roomMessageLink';
import { canApplyRoomPicker } from '@/utils/roomChatAccess';
import { mergeRoomMessages } from '@/utils/roomChatDelivery';

type Attachment = { uri: string; kind: 'photo' | 'video'; mimeType: string };
type PendingSend = { id: string; body: string; attachment: Attachment | null };
const PHOTO_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;

export default function HittingurRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useApp();
  return <RoomSession key={`${id}:${user?.id}`} id={user ? id : undefined} />;
}

function RoomSession({ id }: { id?: string }) {
  const { t, theme, locale, user } = useApp();
  const copy = meetupRoomChatCopy(locale);
  const { markReadLocally } = useChatInbox();
  const [room, setRoom] = useState<MeetupRoomSummary | null>(null);
  const [members, setMembers] = useState<MeetupRoomMember[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [messages, setMessages] = useState<MeetupRoomMessage[]>([]);
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [error, setError] = useState<'load' | 'send' | 'link' | null>(null);
  const [mediaError, setMediaError] = useState<'size' | 'pick' | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<'queued' | 'removed' | null>(null);
  const [reload, setReload] = useState(0);
  const active = useRef(false);
  const focused = useRef(false);
  const systemPicker = useRef<number | null>(null);
  const generation = useRef(0);
  const revision = useRef(0);
  const sendBusy = useRef(false);
  const pickerBusy = useRef(false);
  const avatarOperation = useRef(false);
  const olderBusy = useRef(false);
  const pageDepth = useRef(1);
  const pending = useRef<PendingSend | null>(null);
  const refreshRoom = useRef<() => Promise<void>>(async () => {});
  const latest = useRef({ room, messages });
  const list = useRef<FlatList<MeetupRoomMessage>>(null);
  const nearBottom = useRef(true);
  latest.current = { room, messages };
  const isCurrent = (token: number) => active.current && generation.current === token && AppState.currentState === 'active';
  const canCompose = Boolean(room?.canPost && !room.isPaused && Date.parse(room.postingClosesAt) > Date.now());
  const clearContent = (preserveDraft = false) => {
    latest.current = { room: null, messages: [] };
    setRoom(null); setMembers([]); setMessages([]); setCursor(null);
    if (!preserveDraft) { setMembersOpen(false); setBody(''); setAttachment(null); pending.current = null; }
    setMediaError(null); setAvatarError(false); setAvatarNotice(null);
    setSending(false); setPicking(false); setAvatarBusy(false); setOlderLoading(false);
  };

  useFocusEffect(useCallback(() => {
    generation.current++; focused.current = true; active.current = AppState.currentState === 'active';
    pageDepth.current = 1; nearBottom.current = true;
    clearContent(); setLoading(Boolean(id));
    if (!id) return () => { active.current = false; focused.current = false; generation.current++; };
    let unsubscribe = () => {};
    let subscribedRoom: string | null = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let refreshAgain = false;
    let disposed = false;
    const refresh = async () => {
      if (disposed || !active.current || AppState.currentState !== 'active') return;
      if (refreshing) { refreshAgain = true; return; }
      refreshing = true;
      const token = generation.current;
      const request = ++revision.current;
      try {
        const value = await api.getMeetupRoom(id);
        if (!isCurrent(token) || request !== revision.current) return;
        const history: MeetupRoomMessage[] = [];
        let next: string | null = null;
        const roster = value && !value.isPaused ? await api.listMeetupRoomMembers(value.id) : [];
        if (!isCurrent(token) || request !== revision.current) return;
        if (value && !value.isPaused) {
          // Reload every visible page so hidden media and expired URLs are replaced too.
          for (let depth = 0; depth < pageDepth.current; depth++) {
            const page: MeetupRoomMessagePage = await api.listMeetupRoomMessages(value.id, next);
            history.unshift(...page.items); next = page.nextCursor;
            if (!isCurrent(token) || request !== revision.current) return;
            if (!next) break;
          }
          await api.markMeetupRoomRead(value.id);
          if (!isCurrent(token) || request !== revision.current) return;
          markReadLocally(`room:${value.id}`);
        }
        latest.current = { room: value, messages: history };
        setRoom(value); setMembers(roster); setMessages(history); setCursor(next);
        setError(current => current === 'load' ? null : current);
        if (!value || value.isPaused || !value.canPost) { setAttachment(null); setBody(''); pending.current = null; }
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
        if (isCurrent(token) && request === revision.current) { clearContent(); setError('load'); }
      } finally {
        refreshing = false;
        if (isCurrent(token) && request === revision.current) setLoading(false);
        if (refreshAgain && active.current && !disposed) { refreshAgain = false; void refresh(); }
      }
    };
    refreshRoom.current = refresh;
    void refresh();
    // Room media, avatars and member face pictures use short-lived authorized URLs.
    const interval = setInterval(() => { void refresh(); }, 45_000);
    const state = AppState.addEventListener('change', value => {
      ++revision.current;
      if (value === 'active') {
        active.current = true; setLoading(true);
        setSending(sendBusy.current); setPicking(pickerBusy.current); setAvatarBusy(avatarOperation.current); setOlderLoading(olderBusy.current);
        void refresh();
      } else {
        active.current = false; clearTimeout(deadline);
        // Android's system gallery can background the activity. Reauthorize its result on return.
        if (value === 'background') {
          if (systemPicker.current === generation.current) clearContent(true);
          else { generation.current++; clearContent(); }
        }
      }
    });
    return () => {
      disposed = true;
      active.current = false; focused.current = false; generation.current++; ++revision.current;
      clearTimeout(deadline); clearInterval(interval); unsubscribe(); state.remove();
      clearContent();
      refreshRoom.current = async () => {};
    };
  }, [id, reload, markReadLocally]));

  const authorizePicker = async (token: number, roomId: string, capability: 'media' | 'avatar') => {
    if (!id || !focused.current || generation.current !== token) return null;
    const value = await api.getMeetupRoom(id);
    if (!isCurrent(token)) return null;
    if (!canApplyRoomPicker({ focused: focused.current, generation: generation.current, appState: AppState.currentState, room: value }, token, roomId, capability)) {
      clearContent(); setRoom(value); latest.current = { room: value, messages: [] };
      void refreshRoom.current(); return null;
    }
    setRoom(value); latest.current = { ...latest.current, room: value };
    void refreshRoom.current(); return value;
  };
  const launchSystemPicker = async (token: number, options: ImagePicker.ImagePickerOptions) => {
    systemPicker.current = token;
    try { return await ImagePicker.launchImageLibraryAsync(options); }
    finally { if (systemPicker.current === token) systemPicker.current = null; }
  };

  const loadOlder = async () => {
    if (!room || !cursor || olderBusy.current) return;
    const token = generation.current;
    const request = revision.current;
    olderBusy.current = true; setOlderLoading(true); nearBottom.current = false;
    try {
      const page = await api.listMeetupRoomMessages(room.id, cursor);
      if (isCurrent(token) && request === revision.current) {
        pageDepth.current++; setMessages(current => mergeRoomMessages(current, page.items)); setCursor(page.nextCursor);
      }
    } catch { if (isCurrent(token) && request === revision.current) { clearContent(); setError('load'); } }
    finally { olderBusy.current = false; if (active.current) setOlderLoading(false); }
  };
  const pickMedia = async () => {
    if (!canCompose || sendBusy.current || pickerBusy.current || avatarOperation.current || systemPicker.current !== null) return;
    const roomId = latest.current.room?.id;
    if (!roomId) return;
    const token = generation.current;
    if (!isCurrent(token)) return;
    pickerBusy.current = true; setPicking(true); setMediaError(null);
    try {
      const result = await launchSystemPicker(token, { mediaTypes: ['images', 'videos'], quality: 0.85 });
      if (result.canceled || !await authorizePicker(token, roomId, 'media')) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      const kind = asset.type === 'video' ? 'video' : 'photo';
      if ((asset.fileSize ?? 0) > (kind === 'video' ? VIDEO_LIMIT : PHOTO_LIMIT)) { setMediaError('size'); return; }
      setAttachment({ uri: asset.uri, kind, mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg') });
      pending.current = null; setError(null);
    } catch { if (isCurrent(token)) setMediaError('pick'); }
    finally { pickerBusy.current = false; if (systemPicker.current === token) systemPicker.current = null; if (active.current) setPicking(false); }
  };
  const send = async () => {
    if (!canCompose || (!body.trim() && !attachment) || sendBusy.current || pickerBusy.current || avatarOperation.current || systemPicker.current !== null) return;
    const token = generation.current;
    if (!isCurrent(token)) return;
    const currentRoom = latest.current.room;
    if (!currentRoom?.canPost || currentRoom.isPaused) return;
    const previous = pending.current;
    const attempt = previous?.body === body.trim() && previous.attachment?.uri === attachment?.uri
      ? previous : { id: Crypto.randomUUID(), body: body.trim(), attachment };
    pending.current = attempt; sendBusy.current = true; setSending(true); setError(null);
    try {
      const message = attempt.attachment
        ? await api.sendMeetupRoomMedia(currentRoom.id, attempt.attachment.uri, attempt.attachment.kind, attempt.attachment.mimeType, attempt.body, attempt.id)
        : await api.sendMeetupRoomMessage(currentRoom.id, attempt.body, attempt.id);
      if (isCurrent(token) && latest.current.room?.id === currentRoom.id && !latest.current.room.isPaused && Date.parse(latest.current.room.readingClosesAt) > Date.now()) {
        nearBottom.current = true; setMessages(current => mergeRoomMessages(current, [message]));
        setBody(''); setAttachment(null); pending.current = null;
      }
    } catch { if (isCurrent(token)) setError('send'); }
    finally { sendBusy.current = false; if (active.current) setSending(false); }
  };
  const updateAvatar = async (remove = false) => {
    const currentRoom = latest.current.room;
    if (!currentRoom?.canManageAvatar || currentRoom.isPaused || avatarOperation.current || sendBusy.current || pickerBusy.current || systemPicker.current !== null) return;
    const token = generation.current;
    if (!isCurrent(token)) return;
    avatarOperation.current = true; setAvatarBusy(true); setAvatarError(false); setAvatarNotice(null);
    try {
      if (remove) await api.removeMeetupRoomAvatar(currentRoom.id);
      else {
        const result = await launchSystemPicker(token, { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
        if (result.canceled || !await authorizePicker(token, currentRoom.id, 'avatar')) return;
        const asset = result.assets[0];
        if (!asset?.uri) return;
        if ((asset.fileSize ?? 0) > PHOTO_LIMIT) { setMediaError('size'); return; }
        await api.uploadMeetupRoomAvatar(currentRoom.id, asset.uri, asset.mimeType ?? 'image/jpeg');
      }
      if (isCurrent(token)) { setAvatarNotice(remove ? 'removed' : 'queued'); await refreshRoom.current(); }
    } catch { if (isCurrent(token)) setAvatarError(true); }
    finally { avatarOperation.current = false; if (systemPicker.current === token) systemPicker.current = null; if (active.current) setAvatarBusy(false); }
  };
  const openHost = (messageId: string, hostname: string) => {
    const confirmedLink = prepareRoomMessageLink(
      () => ({ ...latest.current, active: active.current && AppState.currentState === 'active' }), messageId, hostname,
    );
    if (!confirmedLink) return;
    confirmAction({
      title: t('hittingar.room.externalTitle'), message: t('hittingar.room.externalBody', { hostname }),
      cancelLabel: t('common.cancel'), confirmLabel: t('hittingar.room.openLink'),
      onConfirm: async () => {
        const match = confirmedLink(); if (!match) return;
        const token = generation.current; setError(null);
        try { await Linking.openURL(match); } catch { if (isCurrent(token)) setError('link'); }
      },
    });
  };
  return <Screen scroll={false} back title={room?.title ?? copy.title}>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {room && !room.isPaused && <View style={[styles.persistentHeader, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.roomIdentity}><RoomAvatar uri={room.avatarUrl} name={copy.chatPhoto} size={40} group /><Text numberOfLines={1} style={[styles.roomTitle, { color: theme.colors.text }]}>{room.title ?? copy.title}</Text></View>
        <RoomMembers members={members} expanded={membersOpen} onToggle={() => { if (!membersOpen) { nearBottom.current = false; Keyboard.dismiss(); } setMembersOpen(value => !value); }} />
        {membersOpen && room.canManageAvatar && <View style={styles.avatarActions}>
          <Button variant="secondary" icon="camera-outline" label={room.avatarUrl ? copy.changeChatPhoto : copy.addChatPhoto} loading={avatarBusy} disabled={sending || picking} onPress={() => void updateAvatar()} />
          {room.avatarUrl && <Button variant="ghost" label={copy.removeChatPhoto} disabled={avatarBusy || sending || picking} onPress={() => void updateAvatar(true)} />}
        </View>}
        {membersOpen && avatarNotice && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>{avatarNotice === 'queued' ? copy.avatarQueued : copy.avatarRemoved}</Text>}
        {membersOpen && avatarError && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{copy.avatarError}</Text>}
      </View>}
      <FlatList ref={list} data={messages} keyExtractor={item => item.id} contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={event => { const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent; nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100; }} scrollEventThrottle={100}
        onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
        ListHeaderComponent={<View style={styles.header}>
          <Text style={{ color: theme.colors.textMuted }}>{copy.privacy}</Text>
          <TrustBanner icon="chatbubbles-outline" title={t('hittingar.room.privateTitle')} body={t('hittingar.room.lifecycle')} />
          {loading && <ActivityIndicator accessibilityLabel={t('common.loading')} color={theme.colors.accent} />}
          {error && <><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('common.error')}</Text>{error === 'load' && <Button label={t('common.retry')} onPress={() => setReload(value => value + 1)} />}</>}
          {!room && !loading && !error && <EmptyState icon="lock-closed-outline" title={t('hittingar.room.unavailable')} body={t('hittingar.room.unavailableBody')} />}
          {room?.isPaused && <TrustBanner icon="pause-circle-outline" title={t('hittingar.room.paused')} body={t('hittingar.room.pausedBody')} />}
          {cursor && <Button label={t('chat.older')} loading={olderLoading} onPress={() => void loadOlder()} />}
          {room && !room.isPaused && !messages.length && !loading && <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>{t('hittingar.room.empty')}</Text>}
        </View>}
        renderItem={({ item: message }) => <View style={[styles.message, { backgroundColor: theme.colors.surface, borderColor: message.sender?.id === user?.id ? theme.colors.accent : theme.colors.border }]}>
          <View style={styles.senderRow}>{message.sender && <RoomAvatar uri={message.sender.avatarUrl} name={copy.profilePhoto(message.sender.displayName)} size={32} />}<Text style={[styles.sender, { color: theme.colors.text }]}>{message.sender?.displayName ?? t('hittingar.room.system')}</Text><Text style={[styles.timestamp, { color: theme.colors.textMuted }]}>{new Date(message.createdAt).toLocaleTimeString(locale === 'is' ? 'is-IS' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</Text></View>
          {message.media?.status === 'approved' && (message.media.url ? <RoomMediaPreview uri={message.media.url} kind={message.media.kind} /> : <Text style={{ color: theme.colors.textMuted }}>{copy.mediaUnavailable}</Text>)}
          {message.media?.status === 'pending' && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>{copy.mediaPending}</Text>}
          {message.media?.status === 'rejected' && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{copy.mediaRejected}</Text>}
          {Boolean(message.body) && <Text style={{ color: theme.colors.text, lineHeight: 22 }}>{message.body}</Text>}
          {message.linkHostnames.map(hostname => <Pressable key={hostname} accessibilityRole="button" accessibilityLabel={`${t('hittingar.room.openLink')}: ${hostname}`} onPress={() => openHost(message.id, hostname)} style={styles.link}><Ionicons name="open-outline" size={16} color={theme.colors.warning} /><Text style={{ color: theme.colors.warning, fontWeight: '800' }}>{hostname}</Text></Pressable>)}
        </View>} />
      {room && <View style={[styles.composer, { backgroundColor: theme.colors.canvas, borderTopColor: theme.colors.border }]}>
        {attachment && <View style={[styles.attachment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><RoomMediaPreview uri={attachment.uri} kind={attachment.kind} selected /><Button variant="ghost" icon="close-outline" label={copy.removeMedia} disabled={sending || picking} onPress={() => { setAttachment(null); pending.current = null; }} /></View>}
        {mediaError && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{mediaError === 'size' ? copy.mediaTooLarge : copy.mediaError}</Text>}
        <View style={styles.composerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.addMedia} accessibilityState={{ disabled: !canCompose || sending || picking || avatarBusy }} disabled={!canCompose || sending || picking || avatarBusy} onPress={() => void pickMedia()} style={[styles.mediaButton, (!canCompose || sending || picking || avatarBusy) && { opacity: 0.45 }]}>{picking ? <ActivityIndicator color={theme.colors.accent} /> : <Ionicons name="add-circle-outline" size={28} color={theme.colors.accent} />}</Pressable>
          <TextInput value={body} onFocus={() => setMembersOpen(false)} onChangeText={value => { setBody(value); pending.current = null; }} accessibilityLabel={attachment ? copy.caption : t('hittingar.room.placeholder')} maxLength={2000} editable={canCompose && !sending && !picking} multiline placeholder={canCompose ? (attachment ? copy.caption : t('hittingar.room.placeholder')) : t('hittingar.room.closed')} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={error === 'send' ? t('common.retry') : t('common.send')} accessibilityState={{ disabled: !canCompose || (!body.trim() && !attachment) || sending || picking || avatarBusy, busy: sending }} disabled={!canCompose || (!body.trim() && !attachment) || sending || picking || avatarBusy} onPress={() => void send()} style={[styles.sendButton, { backgroundColor: theme.colors.accent }, (!canCompose || (!body.trim() && !attachment) || sending || picking || avatarBusy) && { opacity: 0.45 }]}>{sending ? <ActivityIndicator color={theme.colors.textOnAccent} /> : <Ionicons name={error === 'send' ? 'refresh' : 'send'} size={22} color={theme.colors.textOnAccent} />}</Pressable>
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.composerHint, { color: theme.colors.textMuted }]}>{sending ? (attachment ? copy.sendingMedia : copy.sending) : copy.mediaLimits}</Text>
      </View>}
    </KeyboardAvoidingView>
  </Screen>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, list: { padding: 18, gap: 10, flexGrow: 1 }, header: { gap: 14, paddingBottom: 6 },
  persistentHeader: { paddingHorizontal: 18, paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  roomIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 }, roomTitle: { flex: 1, fontSize: 16, fontWeight: '800' },
  avatarActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  message: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, gap: 8 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sender: { fontWeight: '900', flex: 1, flexShrink: 1 }, timestamp: { fontSize: 11 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 }, composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderWidth: 1, borderRadius: 16, padding: 12, textAlignVertical: 'top' },
  mediaButton: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, sendButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  composerHint: { fontSize: 11, lineHeight: 16 }, attachment: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 8, gap: 4 },
});
