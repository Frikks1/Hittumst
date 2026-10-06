import { Text, TextInput } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, EmptyState, IconButton, Screen } from '@/components/ui';
import { profileActivityCopy } from '@/i18n/profileActivity';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { AlbumShare, ConversationSummary } from '@/types/domain';

export default function ChatsScreen() {
  const router=useRouter();
  const {locationAllowed,user,t,theme,locale}=useApp();
  const [items,setItems]=useState<ConversationSummary[]>([]);
  const [shares,setShares]=useState<AlbumShare[]>([]);
  const [section,setSection]=useState<'chats'|'albums'>('chats');
  const [query,setQuery]=useState('');
  const [searchQuery,setSearchQuery]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setSearchQuery(query.trim()),300);return()=>clearTimeout(timer);},[query]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [pending,setPending]=useState<string|null>(null);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loadingMore,setLoadingMore]=useState(false);
  const moreBusy=useRef(false);
  const revision=useRef(0);
  const actionBusy=useRef(false);
  const load=useCallback(async()=>{
    const current=++revision.current;
    if(!locationAllowed||!user){setItems([]);setShares([]);setLoading(false);return;}
    setLoading(true);setError(false);
    try{
      // Each section can recover independently if its service is unavailable.
      if(section==='chats'){const result=await api.listConversations(null,searchQuery);if(current===revision.current){setItems(result.items);setCursor(result.nextCursor);}}
      else {const result=await api.listAlbumShares();if(current===revision.current)setShares(result);}
    }catch{if(current===revision.current)setError(true);}
    finally{if(current===revision.current)setLoading(false);}
  },[locationAllowed,section,user,searchQuery]);
  const loadMore=async()=>{
    if(!cursor||moreBusy.current||loading||section!=='chats')return;
    const current=revision.current;moreBusy.current=true;setLoadingMore(true);
    try{const page=await api.listConversations(cursor,searchQuery);if(current===revision.current){setItems(items=>[...new Map([...items,...page.items].map(item=>[item.id,item])).values()]);setCursor(page.nextCursor);}}
    catch{if(current===revision.current)setError(true);}
    finally{moreBusy.current=false;setLoadingMore(false);}
  };
  useFocusEffect(useCallback(()=>{void load();return()=>{revision.current++;setItems([]);setShares([]);};},[load]));
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase(locale==='is'?'is-IS':'en-GB');
    return items.filter(item=>`${item.member.displayName} ${item.lastMessage}`.toLocaleLowerCase(locale==='is'?'is-IS':'en-GB').includes(needle));
  },[items,locale,query]);
  const action=async(share:AlbumShare,operation:'accept'|'decline'|'revoke')=>{
    if(actionBusy.current)return;
    actionBusy.current=true;setPending(share.id);setError(false);
    const current=revision.current;
    try{
      if(operation==='revoke')await api.revokeAlbumShare(share.id);
      else await api.respondToAlbumShare(share.id,operation==='accept');
      if(current!==revision.current)return;
      await load();
      if(operation==='accept')router.push(`/album-share/${share.id}?ownerId=${share.ownerId}`);
    }catch{if(current===revision.current)setError(true);}
    finally{actionBusy.current=false;setPending(null);}
  };
  const rows:Array<ConversationSummary|AlbumShare>=!locationAllowed?[]:section==='chats'?filtered:shares;
  return <Screen scroll={false}>
    <FlatList data={rows} keyExtractor={item=>item.id} contentContainerStyle={styles.page} refreshing={loading} onRefresh={()=>void load()}
      onEndReached={()=>void loadMore()} onEndReachedThreshold={0.3}
      ListFooterComponent={section==='chats'&&cursor?<Button variant="secondary" loading={loadingMore} label={t('discovery.more')} onPress={()=>void loadMore()} />:null}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text accessibilityRole="header" style={[styles.title,{color:theme.colors.text,flex:1}]}>{t('chats.title')}</Text>
          <IconButton icon="flame-outline" label={profileActivityCopy(locale).title} onPress={()=>router.push('/interest?tab=taps')} />
        </View>
        <View style={styles.sections}><ChoiceChip label={t('chats.title')} selected={section==='chats'} onPress={()=>setSection('chats')} /><ChoiceChip label={t('albums.title')} selected={section==='albums'} onPress={()=>setSection('albums')} /></View>
        {section==='chats'?<View style={[styles.search,{backgroundColor:theme.colors.surface,borderColor:theme.colors.border}]}>
          <Ionicons name="search-outline" size={20} color={theme.colors.textMuted} />
          <TextInput accessibilityLabel={t('inbox.search')} value={query} onChangeText={setQuery} placeholder={t('inbox.search')} placeholderTextColor={theme.colors.textMuted} style={[styles.searchInput,{color:theme.colors.text}]} autoCorrect={false} returnKeyType="search" />
        </View>:<Button variant="secondary" icon="images-outline" label={t('albums.manage')} onPress={()=>router.push('/albums')} />}
        {error&&<View accessibilityRole="alert" style={styles.error}><Text style={{color:theme.colors.danger}}>{t('chats.error')}</Text><Button variant="secondary" label={t('common.retry')} onPress={()=>void load()} /></View>}
      </View>}
      ListEmptyComponent={!locationAllowed?<EmptyState icon="location-outline" title={t('location.staleTitle')} body={t('location.lockedHint')} action={<Button label={t('location.verifyAgain')} onPress={()=>router.push('/location-gate')} />} /> :
        loading?<View style={styles.loading}><ActivityIndicator accessibilityLabel={t('common.loading')} color={theme.colors.accent} /></View>:
        error?null:section==='albums'?<EmptyState icon="lock-closed-outline" title={t('albums.empty')} />:
        <EmptyState icon="chatbubbles-outline" title={t(query?'inbox.noResults':'chats.emptyTitle')} body={t(query?'inbox.noResultsHelp':'chats.emptyBody')} action={!query?<Button label={t('inbox.start')} onPress={()=>router.push('/(tabs)/discover')} />:undefined} />}
      renderItem={({item})=>{
        if('member'in item)return <Pressable accessibilityRole="button" accessibilityLabel={`${item.member.displayName}. ${item.lastMessage||t('inbox.newConversation')}. ${t('inbox.unread',{count:item.unreadCount})}`}
          onPress={()=>router.push(`/chat/${item.id}?name=${encodeURIComponent(item.member.displayName)}&profileId=${item.member.id}`)} style={({pressed})=>[styles.row,{borderBottomColor:theme.colors.border,opacity:pressed?0.7:1}]}>
          {item.member.photos[0]?.url?<Image source={item.member.photos[0].url} recyclingKey={item.member.id} cachePolicy="memory" style={styles.avatar} />:<View style={[styles.avatar,styles.placeholder,{backgroundColor:theme.colors.accentSoft}]}><Ionicons name="person-outline" size={24} color={theme.colors.accent} /></View>}
          <View style={styles.copy}><Text numberOfLines={1} style={[styles.name,{color:theme.colors.text}]}>{item.member.displayName}</Text><Text numberOfLines={1} style={{color:item.unreadCount?theme.colors.text:theme.colors.textMuted,fontWeight:item.unreadCount?'700':'400'}}>{item.lastMessage||t('inbox.newConversation')}</Text></View>
          <View style={styles.meta}><Text style={[styles.time,{color:theme.colors.textMuted}]}>{new Date(item.lastMessageAt).toLocaleDateString(locale==='is'?'is-IS':'en-GB',{day:'numeric',month:'short'})}</Text>{item.unreadCount>0&&<View style={[styles.badge,{backgroundColor:theme.colors.accent}]}><Text style={{color:theme.colors.textOnAccent,fontSize:12,fontWeight:'800'}}>{item.unreadCount>99?'99+':item.unreadCount}</Text></View>}</View>
        </Pressable>;
        return <View style={[styles.album,{borderColor:theme.colors.border,backgroundColor:theme.colors.surface}]}>
          <View style={styles.albumHeading}><Ionicons name="lock-closed-outline" size={23} color={theme.colors.accent} /><View style={styles.copy}><Text style={[styles.name,{color:theme.colors.text}]}>{item.isIncoming&&!item.acceptedAt?t('chat.albumRequest'):item.albumName}</Text><Text style={{color:theme.colors.textMuted}}>{t(item.isIncoming?'albums.received':'albums.shared')} · {t(`albums.${item.status}`)}</Text></View></View>
          {item.isIncoming&&item.status==='pending'&&<><Button loading={pending===item.id} disabled={Boolean(pending)} label={t('albums.accept')} onPress={()=>void action(item,'accept')} /><Button disabled={Boolean(pending)} variant="secondary" label={t('albums.decline')} onPress={()=>void action(item,'decline')} /></>}
          {item.isIncoming&&item.status==='accepted'&&<Button label={t('albums.open')} onPress={()=>router.push(`/album-share/${item.id}?ownerId=${item.ownerId}`)} />}
          {!item.isIncoming&&['pending','accepted','consumed'].includes(item.status)&&<Button disabled={Boolean(pending)} loading={pending===item.id} variant="secondary" label={t('albums.revoke')} onPress={()=>void action(item,'revoke')} />}
        </View>;
      }} />
  </Screen>;
}
const styles=StyleSheet.create({
  page:{paddingHorizontal:18,paddingTop:20,paddingBottom:24,flexGrow:1},header:{gap:16,paddingBottom:14},title:{fontSize:30,fontWeight:'900',letterSpacing:-0.8},sections:{flexDirection:'row',gap:8},
  search:{minHeight:52,borderWidth:1,borderRadius:18,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10},searchInput:{flex:1,fontSize:16,minHeight:50},
  row:{minHeight:94,borderBottomWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'center',gap:12},avatar:{width:58,height:58,borderRadius:20},placeholder:{alignItems:'center',justifyContent:'center'},
  copy:{flex:1,gap:6},name:{fontSize:17,fontWeight:'800'},meta:{alignItems:'flex-end',gap:8},time:{fontSize:11},badge:{minWidth:24,minHeight:24,borderRadius:12,paddingHorizontal:6,alignItems:'center',justifyContent:'center'},
  album:{borderWidth:1,borderRadius:20,padding:16,gap:12,marginBottom:12},albumHeading:{flexDirection:'row',alignItems:'center',gap:12},error:{gap:10},loading:{minHeight:240,justifyContent:'center'},
});
