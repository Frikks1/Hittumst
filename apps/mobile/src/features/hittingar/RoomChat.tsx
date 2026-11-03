import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { meetupRoomChatCopy } from '@/i18n/meetupRoomChat';
import { useApp } from '@/providers/AppProvider';
import type { MeetupRoomMember } from '@/types/domain';

export function RoomAvatar({ uri, name, size = 36, group = false }: { uri?: string; name: string; size?: number; group?: boolean }) {
  const { theme } = useApp();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const style = { width: size, height: size, borderRadius: size / 2 };
  return uri && !failed
    ? <Image source={uri} recyclingKey={`${name}:${uri}`} cachePolicy="memory" accessibilityLabel={name} contentFit="cover" onError={() => setFailed(true)} style={style} />
    : <View accessibilityLabel={name} style={[style, styles.avatarFallback, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name={group ? 'people-outline' : 'person-outline'} size={size * 0.5} color={theme.colors.accent} /></View>;
}

export function RoomMembers({ members, expanded, onToggle }: { members: MeetupRoomMember[]; expanded: boolean; onToggle: () => void }) {
  const { theme, locale, user } = useApp();
  const copy = meetupRoomChatCopy(locale);
  return <View style={[styles.members, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={expanded ? copy.hideMembers : copy.showMembers} accessibilityHint={copy.members(members.length)} accessibilityState={{ expanded }} aria-expanded={expanded} onPress={onToggle} style={styles.memberToggle}>
      <Ionicons name="people-outline" size={20} color={theme.colors.accent} />
      <Text style={[styles.memberName, { color: theme.colors.text }]}>{copy.members(members.length)}</Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
    </Pressable>
    {expanded && <ScrollView nestedScrollEnabled style={[styles.memberList, { borderTopColor: theme.colors.border }]} contentContainerStyle={styles.memberListContent} keyboardShouldPersistTaps="handled">{members.map(member => <View key={member.profile.id} style={styles.memberRow}>
      <RoomAvatar uri={member.profile.avatarUrl} name={copy.profilePhoto(member.profile.displayName)} />
      <Text style={[styles.memberName, { color: theme.colors.text }]}>{member.profile.displayName}{member.profile.id === user?.id ? ` · ${copy.you}` : ''}</Text>
      {member.role === 'host' && <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '800' }}>{copy.host}</Text>}
    </View>)}</ScrollView>}
  </View>;
}

function RoomVideo({ uri, label, selected = false }: { uri: string; label: string; selected?: boolean }) {
  const { theme, locale } = useApp();
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer(uri);
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') player.pause(); });
    const status = player.addListener('statusChange', event => { if (event.error) setFailed(true); });
    return () => { listener.remove(); status.remove(); };
  }, [player]);
  return failed
    ? <Text style={{ color: theme.colors.textMuted }}>{meetupRoomChatCopy(locale).mediaUnavailable}</Text>
    : <VideoView accessibilityLabel={label} player={player} nativeControls contentFit="contain" style={[styles.media, selected && styles.selectedMedia]} />;
}

export function RoomMediaPreview({ uri, kind, selected = false }: { uri: string; kind: 'photo' | 'video'; selected?: boolean }) {
  const { theme, locale } = useApp();
  const copy = meetupRoomChatCopy(locale);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const label = selected ? (kind === 'photo' ? copy.selectedPhoto : copy.selectedVideo) : (kind === 'photo' ? copy.photo : copy.video);
  if (failed) return <Text style={{ color: theme.colors.textMuted }}>{copy.mediaUnavailable}</Text>;
  return kind === 'video'
    ? <RoomVideo key={uri} uri={uri} label={label} selected={selected} />
    : <Image source={uri} accessibilityLabel={label} recyclingKey={uri} cachePolicy="memory" onError={() => setFailed(true)} contentFit="contain" style={[styles.media, selected && styles.selectedMedia]} />;
}

const styles = StyleSheet.create({
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  members: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  memberToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 48 },
  memberName: { flex: 1, fontWeight: '700', flexShrink: 1 },
  memberList: { maxHeight: 240, borderTopWidth: StyleSheet.hairlineWidth },
  memberListContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  media: { width: '100%', maxWidth: 420, height: 230, borderRadius: 12 },
  selectedMedia: { height: 120 },
});
