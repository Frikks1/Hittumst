import { Text, TextInput } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button, ChoiceChip, EmptyState, IconButton, Screen } from '@/components/ui';
import { desktopSidebarBreakpoint } from '@/components/DesktopSidebar';
import { projectConversationMessage, reconcileConversationRead } from '@/components/desktopConversationState';
import { profileActivityCopy } from '@/i18n/profileActivity';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { FriendSummary, ChatMessage, ConversationSummary } from '@/types/domain';
import { combineInboxRows } from '@/utils/restoredInbox';
import { selectMainProfilePhoto } from '@/utils/mainProfilePhoto';
import { mergeMessages, validMessageBody } from '@/utils/chatDelivery';
import { loadChatCatchup } from '@/utils/chatSync';
import { chatImprovementsCopy } from '@/i18n/chatImprovements';
import { useConversationPreferences } from '@/providers/useConversationPreferences';
import { useChatDraft } from '@/providers/useChatDraft';
import { useChatInbox } from '@/providers/ChatInboxProvider';
import { useSharedChatStarters } from '@/providers/useSharedChatStarters';
import { hittingarFeature } from '@/features/hittingar/config';
import type { MeetupChatSummary } from '@/services/meetupChatTypes';
import { markFirstConversationStarted } from '@/features/onboarding/checklistStorage';
import { loadConversationInbox } from '@/utils/conversationInbox';

export default function ChatsScreen() {
  const router = useRouter();
  const { locationAllowed, user, t, theme, locale } = useApp();
  const copy = chatImprovementsCopy(locale);
  const local = useConversationPreferences(user?.id);
  const { refreshUnread } = useChatInbox();
  const { width } = useWindowDimensions();
  const desktop = width >= desktopSidebarBreakpoint;
  const [section, setSection] = useState<'chats' | 'friends'>('chats');
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [rooms, setRooms] = useState<MeetupChatSummary[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const revision = useRef(0);
  const readReceipts = useRef(new Map<string, string>());
  const receiptOwner = useRef(user?.id);
  if (receiptOwner.current !== user?.id) { receiptOwner.current = user?.id; readReceipts.current.clear(); }
  const load = useCallback(async () => {
    const current = ++revision.current;
    if (!user) { setItems([]); setRooms([]); setFriends([]); setOwner(null); return; }
    setLoading(true); setError(false);
    if (section === 'friends') {
      try { const value = await api.listFriends(); if (current === revision.current) { setFriends(value); setOwner(user.id); } }
      catch { if (current === revision.current) { setFriends([]); setError(true); } }
    } else if (!locationAllowed) { setItems([]); setRooms([]); setOwner(null); }
    else {
      const results = await Promise.allSettled([
        loadConversationInbox(cursor => api.listConversations(cursor), () => current === revision.current),
        hittingarFeature.enabled ? api.getMeetupChats() : Promise.resolve([] as MeetupChatSummary[]),
      ]);
      if (current === revision.current) {
        const [direct, meetup] = results;
        setItems(direct.status === 'fulfilled' ? (direct.value ?? []).map(item => reconcileConversationRead(item, readReceipts.current.get(item.id))) : []);
        setRooms(meetup.status === 'fulfilled' ? meetup.value : []);
        setOwner(user.id); setError(results.some(result => result.status === 'rejected'));
      }
    }
    if (current === revision.current) setLoading(false);
  }, [user?.id, locationAllowed, section]);
  useEffect(() => { revision.current++; setItems([]); setRooms([]); setFriends([]); setOwner(null); setSelectedId(null); setQuery(''); setPending(null); }, [user?.id, locationAllowed]);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 45_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load(); else { revision.current++; setItems([]); setRooms([]); setOwner(null); } });
    return () => { revision.current++; clearInterval(timer); subscription.remove(); };
  }, [load]));
  const visible = owner === user?.id && locationAllowed && local.ready;
  const direct = visible ? items.filter(item => filter === 'archived' ? local.preferences[item.id]?.archived : !local.preferences[item.id]?.archived && (filter !== 'unread' || item.unreadCount > 0)) : [];
  const roomRows = visible && filter !== 'archived' ? rooms.filter(room => filter !== 'unread' || room.unreadCount > 0) : [];
  const rows = combineInboxRows(direct, roomRows, query);
  const selected = direct.find(item => item.id === selectedId) ?? direct[0];
  const updateConversation = useCallback((id: string, message?: ChatMessage, readThrough?: string, incoming = false) => {
    if (readThrough) { const before = readReceipts.current.get(id); if (!before || readThrough > before) readReceipts.current.set(id, readThrough); }
    setItems(current => current.map(item => item.id !== id ? item : message ? projectConversationMessage(item, message, t('inbox.newConversation'), incoming, readReceipts.current.get(id)) : reconcileConversationRead(item, readReceipts.current.get(id))));
    refreshUnread();
  }, [t, refreshUnread]);
  const friendAction = async (friend: FriendSummary, action: 'accept' | 'decline') => {
    if (pending) return;
    const current = revision.current; setPending(friend.profileId); setError(false);
    try { await api.setFriendship(friend.profileId, action); if (current === revision.current) { setPending(null); await load(); } }
    catch { if (current === revision.current) setError(true); }
    finally { if (current === revision.current) setPending(null); }
  };
  const friendRows = owner === user?.id ? friends.filter(friend => friend.displayName.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : [];
  const header = <View style={styles.header}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.accent, flex: 1 }]}>{t('chats.title')}</Text>
      <IconButton icon="eye-outline" label={profileActivityCopy(locale).title} onPress={() => router.push('/interest?tab=views')} />
      <IconButton icon="create-outline" label={t('inbox.start')} onPress={() => router.push('/(tabs)/discover')} />
      <IconButton icon="ellipsis-horizontal" label={locale === 'is' ? 'Spjallsíur' : 'Inbox filters'} onPress={() => setShowFilters(value => !value)} />
    </View>
    <View style={[styles.sections, { backgroundColor: theme.colors.surface }]}>
      {(['chats', 'friends'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} onPress={() => { setSection(value); setQuery(''); }} style={[styles.segment, section === value && { backgroundColor: theme.colors.accent }]}>
        <Text style={[styles.segmentLabel, { color: section === value ? theme.colors.textOnAccent : theme.colors.text }]}>{value === 'chats' ? t('chats.title') : t('social.friends')}</Text>
      </Pressable>)}
    </View>
    <View style={[styles.search, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Ionicons name="search-outline" size={20} color={theme.colors.textMuted} /><TextInput accessibilityLabel={t('inbox.search')} value={query} onChangeText={setQuery} placeholder={t('inbox.search')} placeholderTextColor={theme.colors.textMuted} style={[styles.searchInput, { color: theme.colors.text }]} /></View>
    {section === 'chats' && <Button variant="secondary" label={locale === 'is' ? '+  Stofna spjallhóp' : '+  Create group chat'} onPress={() => router.push('/groups')} />}
    {showFilters && section === 'chats' && <View style={styles.filters}>{(['all', 'unread', 'archived'] as const).map(value => <ChoiceChip key={value} label={copy[value]} selected={filter === value} onPress={() => setFilter(value)} />)}</View>}
    {error && <View style={styles.error}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('chats.error')}</Text><Button variant="secondary" label={t('common.retry')} onPress={() => void load()} /></View>}
  </View>;
  return <Screen scroll={false}><View style={styles.layout}>
    <View style={[styles.inbox, desktop && section === 'chats' && [styles.desktopInbox, { borderRightColor: theme.colors.border }]]}>
      {section === 'friends' ? <FlatList data={friendRows} keyExtractor={friend => friend.friendshipId} ListHeaderComponent={header} contentContainerStyle={styles.page} refreshing={loading} onRefresh={() => void load()}
        ListEmptyComponent={!loading && !error ? <EmptyState icon="people-outline" title={locale === 'is' ? 'Engir vinir enn' : 'No friends yet'} /> : loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
        renderItem={({ item }) => <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>{item.avatarUrl ? <Image source={item.avatarUrl} style={styles.avatar} contentFit="cover" /> : <View style={[styles.avatar, styles.placeholder, { backgroundColor: theme.colors.surface }]}><Ionicons name="person-outline" size={22} color={theme.colors.textMuted} /></View>}<View style={styles.copy}><Pressable accessibilityRole="link" onPress={() => router.push(`/profile/${item.profileId}`)}><Text style={[styles.name, { color: theme.colors.text }]}>{item.displayName}</Text></Pressable>{item.direction === 'incoming' && item.status === 'pending' ? <View style={{ flexDirection: 'row', gap: 8 }}><Button variant="secondary" disabled={Boolean(pending)} label={locale === 'is' ? 'Samþykkja' : 'Accept'} onPress={() => void friendAction(item, 'accept')} /><Button variant="ghost" disabled={Boolean(pending)} label={locale === 'is' ? 'Hafna' : 'Decline'} onPress={() => void friendAction(item, 'decline')} /></View> : item.direction === 'outgoing' && item.status === 'pending' ? <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Beiðni send' : 'Request sent'}</Text> : null}</View></View>} />
      : <FlatList data={rows} keyExtractor={row => row.id} ListHeaderComponent={header} contentContainerStyle={styles.page} refreshing={loading} onRefresh={() => void load()}
        ListEmptyComponent={!locationAllowed ? <EmptyState icon="location-outline" title={t('location.staleTitle')} body={t('location.lockedHint')} action={<Button label={t('location.verifyAgain')} onPress={() => router.push('/location-gate')} />} /> : loading || !local.ready ? <ActivityIndicator color={theme.colors.accent} /> : !error ? <EmptyState icon="chatbubbles-outline" title={t('chats.emptyTitle')} body={t('chats.emptyBody')} /> : null}
        renderItem={({ item: row }) => {
          const directRow = row.kind === 'direct' ? row.conversation : null;
          const room = row.kind === 'meetup' ? row.room : null;
          const photo = directRow ? selectMainProfilePhoto(directRow.member) : null;
          const uri = photo?.posterUrl ?? photo?.url ?? room?.avatarUrl;
          const name = directRow?.member.displayName ?? room?.title ?? '';
          const unread = directRow?.unreadCount ?? room?.unreadCount ?? 0;
          const date = directRow?.lastMessageAt ?? room?.lastMessageAt;
          return <Pressable accessibilityRole="button" accessibilityLabel={name + '. ' + t('inbox.unread', { count: unread })} onPress={() => {
            if (room) router.push(`/hittingar/${room.meetupId}/room`);
            else if (directRow) {
              if (desktop) setSelectedId(directRow.id);
              else router.push(`/chat/${directRow.id}?name=${encodeURIComponent(name)}&profileId=${directRow.member.id}`);
            }
          }} style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }]}>
            {uri ? <Image source={uri} recyclingKey={row.id} cachePolicy="memory" style={styles.avatar} contentFit="cover" /> : <View style={[styles.avatar, styles.placeholder, { backgroundColor: theme.colors.surface }]}><Ionicons name={room ? 'people-outline' : 'person-outline'} size={24} color={theme.colors.textMuted} /></View>}
            <View style={styles.copy}><Text numberOfLines={1} style={[styles.name, { color: theme.colors.text }]}>{name}</Text><Text numberOfLines={1} style={{ color: unread ? theme.colors.text : theme.colors.textMuted, fontSize: 13 }}>{directRow?.lastMessage || room?.lastMessage || t('inbox.newConversation')}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 7 }}>{date && <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>{new Date(date).toLocaleTimeString(locale === 'is' ? 'is-IS' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>}{unread > 0 && <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}><Text style={{ color: theme.colors.textOnAccent, fontSize: 11 }}>{unread > 99 ? '99+' : unread}</Text></View>}</View>
          </Pressable>;
        }} />}
    </View>
    {desktop && section === 'chats' && <View style={styles.conversationPane}>{selected && user ? <DesktopConversation key={selected.id + ':' + user.id} conversation={selected} onUpdate={updateConversation} /> : <View style={styles.conversationEmpty}><Ionicons name="chatbubbles-outline" size={40} color={theme.colors.textMuted} /></View>}</View>}
  </View></Screen>;
}

function DesktopConversation({ conversation, onUpdate }: { conversation: ConversationSummary; onUpdate: (id: string, message?: ChatMessage, readThrough?: string, incoming?: boolean) => void }) {
  const { theme, t, locale, user, locationAllowed } = useApp();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { draft, setDraft, draftError } = useChatDraft(user?.id, conversation.id);
  const copy = chatImprovementsCopy(locale);
  const sharedInterests = useSharedChatStarters(user?.id, conversation.member.id, locationAllowed);
  const { markReadLocally } = useChatInbox();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<'load' | 'send' | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const list = useRef<FlatList<ChatMessage>>(null);
  const currentMessages = useRef(messages);
  currentMessages.current = messages;
  const knownMessageIds = useRef(new Set<string>());
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const busy = useRef(false);
  const olderBusy = useRef(false);
  const nearBottom = useRef(true);
  const id = conversation.id;
  const openChat = () => router.push(`/chat/${id}?name=${encodeURIComponent(conversation.member.displayName)}&profileId=${conversation.member.id}`);

  useFocusEffect(useCallback(() => {
    if (!user || !locationAllowed) return;
    let subscribed = true;
    active.current = true;
    let refreshing = false;
    let repeat = false;
    const markRead = (items: ChatMessage[]) => {
      const last = items.filter(item => item.status === 'sent').at(-1);
      if (last && subscribed && AppState.currentState === 'active') void api.markConversationRead(id, last.createdAt).then(() => { if (subscribed) { onUpdate(id, undefined, last.createdAt); markReadLocally(id); } }).catch(() => undefined);
    };
    const refresh = async () => {
      if (!subscribed) return;
      if (refreshing) { repeat = true; return; }
      refreshing = true;
      const anchor = currentMessages.current.filter(item => item.status === 'sent').at(-1);
      try {
        const page = await loadChatCatchup(value => api.listMessages(id, value), anchor);
        if (!subscribed) return;
        page.items.forEach(item => knownMessageIds.current.add(item.id));
        setMessages(current => mergeMessages(current, page.items));
        if (!anchor) setCursor(page.nextCursor);
        setError(current => current === 'load' ? null : current);
        markRead(page.items);
      } catch (failure) {
        if (subscribed) {
          setError('load');
          if ((failure as { code?: string }).code === '42501') setMessages([]);
        }
      } finally {
        refreshing = false;
        if (subscribed) setLoading(false);
        if (repeat && subscribed) { repeat = false; void refresh(); }
      }
    };
    void refresh();
    const unsubscribe = api.subscribeMessages(id, message => {
      if (!subscribed) return;
      const incoming = message.senderId !== user.id && !knownMessageIds.current.has(message.id);
      knownMessageIds.current.add(message.id);
      setMessages(current => mergeMessages(current, [message]));
      onUpdate(id, message, undefined, incoming);
      markRead([message]);
    }, () => { void refresh(); });
    const appState = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 8000);
    return () => { subscribed = false; active.current = false; unsubscribe(); appState.remove(); clearInterval(timer); };
  }, [id, locationAllowed, onUpdate, reload, user?.id, markReadLocally]));

  const loadOlder = async () => {
    if (!cursor || loading || olderBusy.current || !active.current) return;
    olderBusy.current = true; setOlderLoading(true); nearBottom.current = false;
    try {
      const page = await api.listMessages(id, cursor);
      if (active.current) { setMessages(current => mergeMessages(current, page.items)); setCursor(page.nextCursor); }
    } catch { if (active.current) setError('load'); }
    finally { olderBusy.current = false; if (mounted.current) setOlderLoading(false); }
  };
  const send = async (retry?: ChatMessage) => {
    const body = retry?.body ?? draft.trim();
    if (!user || !locationAllowed || !active.current || busy.current || !validMessageBody(body)) return;
    const pending: ChatMessage = retry ? { ...retry, status: 'sending' } : { id: Crypto.randomUUID(), conversationId: id, senderId: user.id, body, kind: 'text', createdAt: new Date().toISOString(), status: 'sending' };
    busy.current = true; setSending(true); setError(null); nearBottom.current = true;
    setMessages(current => mergeMessages(current, [pending]));
    if (!retry) setDraft('');
    try {
      const message = await api.sendText(id, body, pending.id);
      if (mounted.current) { setMessages(current => mergeMessages(current, [message])); onUpdate(id, message); void markFirstConversationStarted(user.id).catch(() => undefined); }
    } catch {
      if (mounted.current) { setMessages(current => mergeMessages(current, [{ ...pending, status: 'failed' }])); setError('send'); }
    } finally { busy.current = false; if (mounted.current) setSending(false); }
  };
  const sendImage = async () => {
    if (busy.current || !user || !locationAllowed || !active.current) return;
    busy.current = true; setSending(true); setError(null);
    try {
      const picker = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (picker.canceled || !picker.assets[0] || !active.current) return;
      const message = await api.sendImage(id, picker.assets[0].uri, picker.assets[0].mimeType);
      if (mounted.current) { nearBottom.current = true; setMessages(current => mergeMessages(current, [message])); onUpdate(id, message); void markFirstConversationStarted(user.id).catch(() => undefined); }
    } catch { if (mounted.current) setError('send'); }
    finally { busy.current = false; if (mounted.current) setSending(false); }
  };
  const avatar = conversation.member.photos[0]?.posterUrl ?? conversation.member.photos[0]?.url;

  return <View style={styles.desktopConversation}>
    <View style={[styles.conversationHeader, { borderBottomColor: theme.colors.border }]}>
      <Pressable accessibilityRole="link" accessibilityLabel={conversation.member.displayName} onPress={() => router.push(`/profile/${conversation.member.id}`)} style={styles.conversationMember}>
        {avatar ? <Image source={avatar} style={styles.conversationAvatar} /> : <Ionicons name="person-circle-outline" size={36} color={theme.colors.textMuted} />}
        <Text numberOfLines={1} style={[styles.name, { color: theme.colors.text, flex: 1 }]}>{conversation.member.displayName}</Text>
      </Pressable>
      <IconButton icon="expand-outline" label={t('chats.title')} onPress={openChat} />
      <IconButton icon="shield-checkmark-outline" label={t('chat.safetyOptions')} onPress={() => router.push(`/report/${conversation.member.id}?name=${encodeURIComponent(conversation.member.displayName)}&conversationId=${id}`)} />
    </View>
    {error && <View accessibilityRole="alert" style={styles.previewError}><Text style={{ color: theme.colors.danger }}>{t(error === 'load' ? 'chat.loadingError' : 'chat.sendFailed')}</Text>{error === 'load' && <Button label={t('common.retry')} variant="secondary" onPress={() => setReload(value => value + 1)} />}</View>}
    <FlatList ref={list} data={messages} keyExtractor={item => item.id} contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={cursor ? <Button variant="secondary" label={t('chat.older')} loading={olderLoading} onPress={() => void loadOlder()} /> : null}
      onScroll={event => { const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent; nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100; }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
      ListEmptyComponent={loading ? <ActivityIndicator color={theme.colors.accent} accessibilityLabel={t('common.loading')} /> : error ? null : <View style={styles.starters}><Text style={[styles.name, { color: theme.colors.text }]}>{t('chat.startersTitle')}</Text>{sharedInterests.map(interest => <ChoiceChip key={interest} label={copy.sharedStarter(interest)} selected={draft === copy.sharedStarter(interest)} onPress={() => setDraft(copy.sharedStarter(interest))} />)}{(['chat.starterCoffee', 'chat.starterWeekend', 'chat.starterMusic'] as const).map(key => <Pressable key={key} accessibilityRole="button" onPress={() => setDraft(t(key))} style={[styles.starter, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}><Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{t(key)}</Text></Pressable>)}</View>}
      renderItem={({ item }) => {
        const mine = item.senderId === user?.id;
        return <View style={[styles.messageRow, mine && styles.messageMine]}><View style={styles.messageContent}>
          <View style={[styles.messageBubble, { backgroundColor: mine ? theme.colors.accent : theme.colors.surface }]}>
            {item.kind === 'album_share' ? <Pressable accessibilityRole="button" onPress={openChat}><Ionicons name="lock-closed-outline" size={22} color={mine ? theme.colors.textOnAccent : theme.colors.accent} /><Text style={{ color: mine ? theme.colors.textOnAccent : theme.colors.text }}>{t('chat.albumRequest')}</Text></Pressable> : <>
              {item.imageUrl && <Image source={item.imageUrl} contentFit="cover" style={styles.messageImage} accessibilityLabel={t('chat.image')} />}
              {item.body && <Text style={[styles.messageBody, { color: mine ? theme.colors.textOnAccent : theme.colors.text }]}>{item.body}</Text>}
              {item.mediaStatus === 'pending' && <Text style={{ color: mine ? theme.colors.textOnAccent : theme.colors.text }}>{locale === 'is' ? 'Mynd í öryggisyfirferð…' : 'Image awaiting safety review…'}</Text>}
              {item.mediaStatus === 'rejected' && <Text style={{ color: mine ? theme.colors.textOnAccent : theme.colors.text }}>{locale === 'is' ? 'Myndin var ekki birt.' : 'This image was not published.'}</Text>}
            </>}
          </View>
          <Text style={[styles.messageTime, { color: theme.colors.textMuted }]}>{new Date(item.createdAt).toLocaleTimeString(locale === 'is' ? 'is-IS' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}{mine ? ` · ${t(item.status === 'sending' ? 'chat.sending' : item.status === 'failed' ? 'chat.sendFailed' : 'chat.sent')}` : ''}</Text>
          {item.status === 'failed' && <Button variant="secondary" label={t('chat.retrySend')} disabled={sending} onPress={() => void send(item)} />}
        </View></View>;
      }} />
    {!!draft.trim() && !validMessageBody(draft) && <Text accessibilityRole="alert" style={[styles.previewError, { color: theme.colors.danger }]}>{t('chat.tooLong')}</Text>}
    {draftError && <Text accessibilityRole="alert" style={[styles.previewError, { color: theme.colors.danger }]}>{copy.draftError}</Text>}
    <View style={[styles.composer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('chat.shareAlbum')} style={styles.composerIcon} onPress={() => router.push(`/albums/share?profileId=${conversation.member.id}&name=${encodeURIComponent(conversation.member.displayName)}`)}><Ionicons name="lock-closed-outline" size={20} color={theme.colors.textMuted} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('chat.image')} disabled={sending} accessibilityState={{ disabled: sending }} style={styles.composerIcon} onPress={() => void sendImage()}><Ionicons name="image-outline" size={21} color={theme.colors.textMuted} /></Pressable>
      <TextInput accessibilityLabel={t('chat.placeholder')} placeholder={t('chat.placeholder')} placeholderTextColor={theme.colors.textMuted} value={draft} onChangeText={setDraft} multiline style={[styles.messageInput, { color: theme.colors.text, backgroundColor: theme.colors.canvas }]} />
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.send')} accessibilityState={{ disabled: sending || !validMessageBody(draft), busy: sending }} disabled={sending || !validMessageBody(draft)} onPress={() => void send()} style={[styles.send, { backgroundColor: theme.colors.accent, opacity: sending || !validMessageBody(draft) ? 0.45 : 1 }]}>{sending ? <ActivityIndicator color={theme.colors.textOnAccent} /> : <Ionicons name="arrow-up" size={20} color={theme.colors.textOnAccent} />}</Pressable>
    </View>
  </View>;
}
const styles=StyleSheet.create({
  layout:{flex:1,flexDirection:'row'},inbox:{flexGrow:1,flexShrink:1,flexBasis:0,minWidth:0},desktopInbox:{flexGrow:0,flexShrink:0,flexBasis:330,width:330,borderRightWidth:StyleSheet.hairlineWidth},
  page:{paddingHorizontal:18,paddingTop:24,paddingBottom:24,flexGrow:1},header:{gap:13,paddingBottom:14},title:{fontSize:25,fontWeight:'800',letterSpacing:0},
  sections:{flexDirection:'row',padding:3,borderRadius:6,borderWidth:StyleSheet.hairlineWidth},segment:{flex:1,minHeight:36,borderRadius:4,alignItems:'center',justifyContent:'center',paddingHorizontal:8},segmentLabel:{fontSize:13,fontWeight:'700'},
  filters:{flexDirection:'row',flexWrap:'wrap',gap:8},inboxRow:{flexDirection:'row',alignItems:'center'},rowOptions:{gap:8,paddingVertical:10},
  search:{minHeight:42,borderWidth:StyleSheet.hairlineWidth,borderRadius:6,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:9},searchInput:{flex:1,fontSize:13,minHeight:40},
  row:{minHeight:80,borderBottomWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:5,borderRadius:4},avatar:{width:44,height:44,borderRadius:22},placeholder:{alignItems:'center',justifyContent:'center'},
  copy:{flex:1,gap:5},name:{fontSize:15,fontWeight:'700'},meta:{alignItems:'flex-end',gap:7},time:{fontSize:10},badge:{minWidth:20,minHeight:20,borderRadius:10,paddingHorizontal:5,alignItems:'center',justifyContent:'center'},
  album:{borderWidth:1,borderRadius:8,padding:16,gap:12,marginBottom:12},albumHeading:{flexDirection:'row',alignItems:'center',gap:12},error:{gap:10},loading:{minHeight:240,justifyContent:'center'},
  conversationPane:{flex:1,minWidth:0},conversationEmpty:{flex:1,justifyContent:'center',alignItems:'center',gap:16},emptyTitle:{fontSize:18,fontWeight:'600'},desktopConversation:{flex:1},
  conversationHeader:{minHeight:78,paddingHorizontal:20,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:StyleSheet.hairlineWidth},conversationMember:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:10},conversationAvatar:{width:36,height:36,borderRadius:18},
  messageList:{padding:22,gap:14,flexGrow:1},messageRow:{flexDirection:'row'},messageMine:{justifyContent:'flex-end'},messageContent:{maxWidth:'80%',gap:5},messageBubble:{borderRadius:8,paddingHorizontal:13,paddingVertical:10},messageBody:{fontSize:14,lineHeight:21},messageTime:{fontSize:10,lineHeight:15,paddingHorizontal:3},messageImage:{width:220,height:190,borderRadius:6},
  previewError:{padding:16,gap:8},starters:{gap:12,paddingTop:24},starter:{padding:12,borderWidth:StyleSheet.hairlineWidth,borderRadius:6},
  composer:{padding:12,borderTopWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'flex-end',gap:6},composerIcon:{width:36,height:42,alignItems:'center',justifyContent:'center'},messageInput:{flex:1,minWidth:0,minHeight:42,maxHeight:100,fontSize:13,padding:11,borderRadius:6},send:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center'},
});
