import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ChoiceChip, EmptyState, IconButton, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { AlbumShare, ChatMessage } from '@/types/domain';
import { mergeMessages, validMessageBody } from '@/utils/chatDelivery';

export default function ChatScreen() {
  const { id, name, profileId } = useLocalSearchParams<{ id: string; name?: string; profileId?: string }>();
  const router = useRouter();
  const { t, theme, user, locationAllowed, locale } = useApp();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [shares, setShares] = useState<AlbumShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<'load' | 'send' | 'album' | null>(null);
  const [reload, setReload] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderBusy = useRef(false);
  const busy = useRef(false);
  const focused = useRef(false);
  const scope = useRef('');
  const list = useRef<FlatList<ChatMessage>>(null);
  const nearBottom = useRef(true);
  scope.current = `${id}:${user?.id}:${locationAllowed}`;
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));

  useEffect(() => {
    setMessages([]); setDraft(''); setShares([]); setError(null); busy.current = false; setSending(false);
    setNextCursor(null); setLoadingOlder(false); olderBusy.current = false;
  }, [id, user?.id, locationAllowed]);

  useEffect(() => {
    if (!id || !locationAllowed || !user) return;
    let active = true;
    const context = scope.current;
    setLoading(true); setError(null);
    const markRead = (items: ChatMessage[]) => {
      const latest = items.filter(item => item.status === 'sent').at(-1);
      if (latest && focused.current && AppState.currentState === 'active') void api.markConversationRead(id, latest.createdAt).catch(() => undefined);
    };
    void api.listMessages(id).then(page => {
      if (!active || context !== scope.current) return;
      setMessages(current => mergeMessages(current, page.items)); setNextCursor(page.nextCursor); markRead(page.items);
    }).catch(() => { if (active && context === scope.current) setError('load'); })
      .finally(() => { if (active && context === scope.current) setLoading(false); });
    void api.listAlbumShares().then(items => { if (active && context === scope.current) setShares(items); }).catch(() => undefined);
    const unsubscribe = api.subscribeMessages(id, message => {
      if (!active || context !== scope.current) return;
      setMessages(items => mergeMessages(items, [message])); markRead([message]);
    }, () => { if (active && context === scope.current) setReload(value => value + 1); });
    const appState = AppState.addEventListener('change', state => { if (state === 'active') setReload(value => value + 1); });
    return () => { active = false; unsubscribe(); appState.remove(); };
  }, [id, locationAllowed, user, reload]);

  const loadOlder = async () => {
    if (!id || !nextCursor || olderBusy.current || loading) return;
    const context = scope.current;
    olderBusy.current = true; setLoadingOlder(true); nearBottom.current = false;
    try {
      const page = await api.listMessages(id, nextCursor);
      if (context !== scope.current) return;
      setMessages(current => mergeMessages(current, page.items)); setNextCursor(page.nextCursor);
    } catch { if (context === scope.current) setError('load'); }
    finally { if (context === scope.current) { olderBusy.current = false; setLoadingOlder(false); } }
  };

  const send = async (retry?: ChatMessage) => {
    const body = retry?.body ?? draft.trim();
    if (!id || !user || !locationAllowed || busy.current || !validMessageBody(body)) return;
    const context = scope.current;
    const pending: ChatMessage = retry ? { ...retry, status: 'sending' } : {
      id: Crypto.randomUUID(), conversationId: id, senderId: user.id, body, kind: 'text',
      createdAt: new Date().toISOString(), status: 'sending',
    };
    busy.current = true; setSending(true); setError(null); nearBottom.current = true;
    setMessages(items => mergeMessages(items, [pending]));
    if (!retry) setDraft('');
    try {
      const message = await api.sendText(id, body, pending.id);
      if (context === scope.current) setMessages(items => mergeMessages(items, [message]));
    } catch {
      if (context === scope.current) {
        setMessages(items => mergeMessages(items, [{ ...pending, status: 'failed' }]));
        setError('send');
      }
    } finally {
      if (context === scope.current) { busy.current = false; setSending(false); }
    }
  };
  const sendImage = async () => {
    if (!id || !locationAllowed || busy.current) return;
    const context = scope.current;
    busy.current = true; setSending(true); setError(null);
    try {
      const picker = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (picker.canceled || !picker.assets[0] || context !== scope.current) return;
      const message = await api.sendImage(id, picker.assets[0].uri, picker.assets[0].mimeType);
      if (context === scope.current) { nearBottom.current = true; setMessages(items => mergeMessages(items, [message])); }
    } catch { if (context === scope.current) setError('send'); }
    finally { if (context === scope.current) { busy.current = false; setSending(false); } }
  };
  const respond = async (share: AlbumShare, accept: boolean) => {
    if (busy.current) return;
    const context = scope.current;
    busy.current = true; setSending(true); setError(null);
    try {
      await api.respondToAlbumShare(share.id, accept);
      const updated = await api.listAlbumShares();
      if (context !== scope.current) return;
      setShares(updated);
      if (accept) router.push(`/album-share/${share.id}?ownerId=${share.ownerId}`);
    } catch { if (context === scope.current) setError('album'); }
    finally { if (context === scope.current) { busy.current = false; setSending(false); } }
  };

  if (!locationAllowed) return <Screen back title={name}><EmptyState icon="location-outline" title={t('location.staleTitle')} body={t('location.lockedHint')} action={<Button label={t('location.verifyAgain')} onPress={() => router.push('/location-gate')} />} /></Screen>;
  return <Screen scroll={false} back title={name ?? t('chats.title')}
    right={profileId ? <IconButton icon="shield-checkmark-outline" label={t('chat.safetyOptions')} onPress={() => router.push(`/report/${profileId}?name=${encodeURIComponent(name ?? '')}&conversationId=${id}`)} /> : undefined}>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={styles.safety}><Ionicons name="shield-checkmark-outline" size={15} color={theme.colors.accent} /><Text style={[styles.safetyText, { color: theme.colors.textMuted }]}>{t('chat.safety')}</Text></View>
      {error && <View accessibilityRole="alert" style={styles.error}>
        <Text style={{ color: theme.colors.danger }}>{t(error === 'load' ? 'chat.loadingError' : error === 'album' ? 'chat.albumError' : 'chat.sendFailed')}</Text>
        {error === 'load' && <Button variant="secondary" label={t('common.retry')} onPress={() => setReload(value => value + 1)} />}
      </View>}
      <FlatList ref={list} data={messages} keyExtractor={item => item.id} contentContainerStyle={styles.list}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={nextCursor ? <Button variant="secondary" loading={loadingOlder} label={t('chat.older')} onPress={() => void loadOlder()} /> : null}
        keyboardShouldPersistTaps="handled" onScroll={event => { const {contentOffset,layoutMeasurement,contentSize}=event.nativeEvent; nearBottom.current=contentOffset.y+layoutMeasurement.height>=contentSize.height-100; }} scrollEventThrottle={100}
        onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
        ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel={t('common.loading')} color={theme.colors.accent} /> : error ? null :
          <View style={styles.starters}>
            <Text accessibilityRole="header" style={[styles.starterTitle, {color:theme.colors.text}]}>{t('chat.startersTitle')}</Text>
            <Text style={[styles.starterHelp,{color:theme.colors.textMuted}]}>{t('chat.startersHelp')}</Text>
            {(['chat.starterCoffee','chat.starterWeekend','chat.starterMusic'] as const).map(key => <ChoiceChip key={key} label={t(key)} selected={draft === t(key)} onPress={() => setDraft(t(key))} />)}
          </View>}
        renderItem={({item}) => {
          const mine=item.senderId===user?.id;
          const share=item.albumShareId?shares.find(entry=>entry.id===item.albumShareId):undefined;
          if(item.kind==='album_share') return <View style={[styles.row,mine&&styles.mine]}><View style={[styles.album,{borderColor:theme.colors.border,backgroundColor:theme.colors.surface}]}>
            <Ionicons name="lock-closed" size={24} color={theme.colors.accent} />
            <Text style={[styles.starterTitle,{color:theme.colors.text}]}>{t('chat.albumRequest')}</Text>
            <Text style={{color:theme.colors.textMuted}}>{share?t(`albums.${share.status}`):t('albums.pending')}</Text>
            {share?.isIncoming && share.status==='pending' && <><Button disabled={sending} label={t('albums.accept')} onPress={()=>void respond(share,true)} /><Button disabled={sending} variant="secondary" label={t('albums.decline')} onPress={()=>void respond(share,false)} /></>}
            {share?.isIncoming && share.status==='accepted' && <Button label={t('albums.open')} onPress={()=>router.push(`/album-share/${share.id}?ownerId=${share.ownerId}`)} />}
          </View></View>;
          return <View style={[styles.row,mine&&styles.mine]}><View style={styles.message}>
            <View style={[styles.bubble,{backgroundColor:mine?theme.colors.accent:theme.colors.surfaceRaised}]}>
              {item.imageUrl&&<Image source={item.imageUrl} recyclingKey={item.id} cachePolicy="memory" accessibilityLabel={t('chat.image')} style={styles.messageImage} />}
              {item.body&&<Text style={{color:mine?theme.colors.textOnAccent:theme.colors.text,fontSize:16,lineHeight:23}}>{item.body}</Text>}
            </View>
            <Text accessibilityLiveRegion="polite" style={[styles.timestamp,{color:theme.colors.textMuted}]}>
              {new Date(item.createdAt).toLocaleTimeString(locale==='is'?'is-IS':'en-GB',{hour:'2-digit',minute:'2-digit'})}{mine?` · ${t(item.status==='sending'?'chat.sending':item.status==='failed'?'chat.sendFailed':'chat.sent')}`:''}
            </Text>
            {mine&&item.status==='failed'&&<Button variant="secondary" disabled={sending} label={t('chat.retrySend')} onPress={()=>void send(item)} />}
          </View></View>;
        }} />
      {draft.trim()&&!validMessageBody(draft)&&<Text accessibilityRole="alert" style={[styles.error,{color:theme.colors.danger}]}>{t('chat.tooLong')}</Text>}
      <View style={[styles.composer,{backgroundColor:theme.colors.surface,borderTopColor:theme.colors.border,paddingBottom:Math.max(insets.bottom,10)}]}>
        {profileId&&<Pressable accessibilityRole="button" accessibilityLabel={t('chat.shareAlbum')} style={styles.composerIcon} onPress={()=>router.push(`/albums/share?profileId=${profileId}&name=${encodeURIComponent(name??'')}`)}><Ionicons name="lock-closed-outline" size={21} color={theme.colors.accent} /></Pressable>}
        <Pressable accessibilityRole="button" disabled={sending} accessibilityState={{disabled:sending}} accessibilityLabel={t('chat.image')} style={styles.composerIcon} onPress={()=>void sendImage()}><Ionicons name="image-outline" size={22} color={theme.colors.accent} /></Pressable>
        <TextInput accessibilityLabel={t('chat.placeholder')} value={draft} onChangeText={setDraft} multiline placeholder={t('chat.placeholder')} placeholderTextColor={theme.colors.textMuted} style={[styles.input,{color:theme.colors.text,backgroundColor:theme.colors.surfaceMuted}]} />
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.send')} accessibilityState={{disabled:sending||!validMessageBody(draft),busy:sending}} disabled={sending||!validMessageBody(draft)} onPress={()=>void send()} style={[styles.send,{backgroundColor:theme.colors.accent,opacity:sending||!validMessageBody(draft)?0.45:1}]}>
          {sending?<ActivityIndicator color={theme.colors.textOnAccent} />:<Ionicons name="arrow-up" size={22} color={theme.colors.textOnAccent} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </Screen>;
}
const styles=StyleSheet.create({
  page:{flex:1},safety:{paddingHorizontal:18,paddingVertical:10,flexDirection:'row',gap:8,alignItems:'center'},safetyText:{fontSize:12,lineHeight:18,flex:1},
  list:{padding:16,gap:12,flexGrow:1},row:{flexDirection:'row'},mine:{justifyContent:'flex-end'},message:{maxWidth:'84%',gap:5},
  bubble:{paddingHorizontal:15,paddingVertical:11,borderRadius:20},messageImage:{width:210,height:230,borderRadius:12},
  timestamp:{fontSize:11,lineHeight:17,paddingHorizontal:4},album:{maxWidth:'90%',minWidth:250,padding:16,borderWidth:1,borderRadius:20,gap:12},
  starters:{gap:12,marginTop:32},starterTitle:{fontSize:19,fontWeight:'800',lineHeight:25},starterHelp:{fontSize:14,lineHeight:21},
  error:{paddingHorizontal:16,paddingVertical:8,gap:8},composer:{paddingTop:10,paddingHorizontal:8,borderTopWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'flex-end',gap:4},
  input:{flex:1,minWidth:50,maxHeight:120,minHeight:48,borderRadius:18,paddingHorizontal:12,paddingVertical:12,fontSize:16},
  composerIcon:{width:44,height:48,alignItems:'center',justifyContent:'center'},send:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
});
