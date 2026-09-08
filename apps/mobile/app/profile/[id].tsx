import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Button, ChoiceChip, Screen, TrustBanner, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api, runtimeEnv } from '@/services';
import { profileTagById } from '@/data/profileTags';
import type { ContentReaction, MeetupProfileHistoryItem, MeetupProfileUpcomingItem, ProfileReactionEmoji, PublicProfile, StarredItem } from '@/types/domain';
import { socialUrl } from '@/utils/profileExtras';

function ProfileVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri, useCaching: false }, (instance) => { instance.loop = true; instance.muted = true; });
  return <VideoView player={player} style={styles.video} contentFit="cover" nativeControls />;
}

function FeedbackBlock({ targetType, targetId, title }: { targetType: 'profile' | 'photo' | 'video'; targetId: string; title: string }) {
  const { theme, t } = useApp();
  const [feedback, setFeedback] = useState<{ ratings: Array<{ userId: string; value: -1 | 1 }>; comments: Array<{ id: string; authorName: string; body: string }>; reactions: ContentReaction[] }>({ ratings: [], comments: [], reactions: [] });
  const [comment, setComment] = useState('');
  useEffect(() => { void api.listFeedback(targetType, targetId).then(setFeedback); }, [targetType, targetId]);
  const showRatings = runtimeEnv.appEnvironment === 'development';
  const rate = async (value: -1 | 1) => { await api.rateContent(targetType, targetId, value); setFeedback(await api.listFeedback(targetType, targetId)); };
  const addComment = async () => { if (!comment.trim()) return; await api.commentOnContent(targetType, targetId, comment); setComment(''); setFeedback(await api.listFeedback(targetType, targetId)); };
  const react = async (emoji: ProfileReactionEmoji) => { await api.toggleContentReaction(targetType, targetId, emoji); setFeedback(await api.listFeedback(targetType, targetId)); };
  return <View style={[styles.feedback, { borderColor: theme.colors.border }]}><Text style={[styles.feedbackTitle, { color: theme.colors.text }]}>{showRatings ? title : t('feedback.community')}</Text><View style={styles.reactionRow}>{feedback.reactions.map((item) => <Pressable key={item.emoji} accessibilityRole="button" accessibilityState={{ selected: item.reacted }} onPress={() => void react(item.emoji)} style={[styles.reaction, { borderColor: item.reacted ? theme.colors.accent : theme.colors.border, backgroundColor: item.reacted ? theme.colors.accentSoft : theme.colors.surface }]}><Text>{item.emoji}</Text><Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.count}</Text></Pressable>)}</View>{showRatings && <View style={styles.ratingRow}><Pressable accessibilityLabel={t('feedback.like')} onPress={() => void rate(1)} style={styles.ratingPress}><Ionicons name="thumbs-up-outline" size={19} color={theme.colors.text} /><Text style={{ color: theme.colors.text }}>{feedback.ratings.filter((r) => r.value === 1).length}</Text></Pressable><Pressable accessibilityLabel={t('feedback.dislike')} onPress={() => void rate(-1)} style={styles.ratingPress}><Ionicons name="thumbs-down-outline" size={19} color={theme.colors.text} /><Text style={{ color: theme.colors.text }}>{feedback.ratings.filter((r) => r.value === -1).length}</Text></Pressable><Text style={{ color: theme.colors.textMuted }}>{t('feedback.anonymous')}</Text></View>}<View style={styles.commentRow}><TextInput value={comment} onChangeText={setComment} placeholder={t('feedback.commentPlaceholder')} placeholderTextColor={theme.colors.textMuted} style={[styles.commentInput, { borderColor: theme.colors.border, color: theme.colors.text }]} /><Pressable onPress={() => void addComment()}><Text style={{ color: theme.colors.accent, fontWeight: '800' }}>{t('feedback.comment')}</Text></Pressable></View>{feedback.comments.slice(0, 3).map((item) => <Text key={item.id} style={{ color: theme.colors.textMuted }}><Text style={{ fontWeight: '800', color: theme.colors.text }}>{item.authorName}: </Text>{item.body}</Text>)}</View>;
}

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { discoveryFilters, setDiscoveryFilters, t, theme, locationAllowed } = useApp();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [publicStars, setPublicStars] = useState<StarredItem[]>([]);
  const [meetupHistory, setMeetupHistory] = useState<MeetupProfileHistoryItem[]>([]);
  const [upcomingMeetups, setUpcomingMeetups] = useState<MeetupProfileUpcomingItem[]>([]);
  useEffect(() => { if (id) { void api.getProfile(id).then(setProfile).catch(() => router.back()); void api.listStarredItems(id).then(setPublicStars).catch(() => setPublicStars([])); void api.listProfileMeetupHistory(id).then((page) => setMeetupHistory(page.items)).catch(() => setMeetupHistory([])); void api.listProfileUpcomingMeetups(id).then((page) => setUpcomingMeetups(page.items)).catch(() => setUpcomingMeetups([])); } }, [id, router]);

  if (!profile) return <Screen back><View style={styles.loading}><Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text></View></Screen>;
  const message = async () => {
    if (!locationAllowed) return router.push('/location-gate');
    const conversation = await api.startConversation(profile.id);
    router.push(`/chat/${conversation}?name=${encodeURIComponent(profile.displayName)}&profileId=${profile.id}`);
  };
  const block = () => Alert.alert(t('block.confirmTitle', { name: profile.displayName }), t('block.confirmBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('block.action'), style: 'destructive', onPress: () => void api.block(profile.id).then(() => router.replace('/(tabs)/discover')) },
  ]);

  return (
    <Screen back>
      <View style={styles.page}>
        <View style={styles.hero}>
          {profile.photos[0]?.url ? <Image source={profile.photos[0].url} style={styles.heroImage} /> : <View style={[styles.heroImage, styles.placeholder, { backgroundColor: theme.colors.surfaceMuted }]}><Ionicons name="person" size={70} color={theme.colors.textMuted} /></View>}
          <View style={styles.heroOverlay}>
            <View style={styles.statusLine}>
              {profile.isOnline && <View style={styles.onlineDot} />}
              <Text style={styles.statusText}>{profile.isOnline ? 'Online' : t(`distance.${profile.distanceBand}`)}</Text>
            </View>
            <Text style={styles.heroName}>{profile.displayName}, {profile.age}</Text>
            <Text style={styles.heroMeta}>{profile.pronouns} · {t(`distance.${profile.distanceBand}`)}</Text>
          </View>
        </View>
        <View style={styles.body}>
          {profile.commentWallEnabled !== false && <FeedbackBlock targetType="profile" targetId={profile.id} title={t('feedback.title')} />}
          {publicStars.length > 0 && <View style={[styles.extraSection, { borderColor: theme.colors.border }]}><Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{t('social.starred')}</Text><View style={styles.chips}>{publicStars.map((item) => <ChoiceChip key={item.id} label={item.label} selected onPress={() => undefined} />)}</View></View>}
          {upcomingMeetups.length > 0 && <View style={[styles.extraSection, { borderColor: theme.colors.border }]}><Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.upcomingHittingar')}</Text>{upcomingMeetups.map((item) => <Pressable key={item.meetupId} onPress={() => router.push(`/hittingar/${item.meetupId}`)} style={styles.externalLink}><Ionicons name="calendar-outline" size={18} color={theme.colors.accent} /><Text style={[styles.externalLinkText, { color: theme.colors.accent }]}>{item.title} · {new Date(item.startsAt).toLocaleDateString()}</Text></Pressable>)}</View>}
          {meetupHistory.length > 0 && <View style={[styles.extraSection, { borderColor: theme.colors.border }]}><Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.hittingarHistory')}</Text>{meetupHistory.map((item) => <Pressable key={item.meetupId} onPress={() => router.push(`/hittingar/${item.meetupId}`)} style={styles.externalLink}><Ionicons name="calendar-outline" size={18} color={theme.colors.accent} /><Text style={[styles.externalLinkText, { color: theme.colors.accent }]}>{item.title} · {new Date(item.startsAt).toLocaleDateString()}</Text></Pressable>)}</View>}
          <View style={styles.chips}>{profile.identity.map((item) => <ChoiceChip key={item} label={t(`identity.${item}`)} selected onPress={() => undefined} />)}</View>
          <Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.about')}</Text>
          <Text style={[textStyles.body, { color: theme.colors.text }]}>{profile.bio}</Text>
          <Text style={[textStyles.eyebrow, styles.section, { color: theme.colors.textMuted }]}>{t('profile.intent')}</Text>
          <View style={styles.chips}>{profile.lookingFor.map((item) => <ChoiceChip key={item} label={t(`intent.${item}`)} selected onPress={() => undefined} />)}</View>
          {profile.tags.length > 0 && <><Text style={[textStyles.eyebrow, styles.section, { color: theme.colors.textMuted }]}>{t('profile.tags')}</Text><View style={styles.chips}>{profile.tags.map((tag) => <ChoiceChip key={tag} label={profileTagById.get(tag)?.label ?? tag} selected={discoveryFilters.tags.includes(tag)} onPress={() => { setDiscoveryFilters({ ...discoveryFilters, tags: [tag] }); router.replace('/(tabs)/discover'); }} />)}</View></>}
          {profile.interests.length > 0 && <><Text style={[textStyles.eyebrow, styles.section, { color: theme.colors.textMuted }]}>{t('profile.interests')}</Text><View style={styles.chips}>{profile.interests.map((interest) => <ChoiceChip key={interest} label={interest} selected onPress={() => undefined} />)}</View></>}
          {profile.socials.length > 0 && <View style={[styles.extraSection, { borderColor: theme.colors.border }]}><Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.socials')}</Text>{profile.socials.map((social) => <Pressable key={social.platform} accessibilityRole="link" onPress={() => void Linking.openURL(socialUrl(social))} style={styles.externalLink}><Ionicons name="open-outline" size={18} color={theme.colors.accent} /><Text style={[styles.externalLinkText, { color: theme.colors.accent }]}>{t(`profile.${social.platform}`)} · {social.handle}</Text></Pressable>)}</View>}
          {profile.videos.length > 0 && <View style={[styles.extraSection, { borderColor: theme.colors.border }]}><Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.videos')}</Text>{profile.videos.map((video) => <Pressable key={video} accessibilityRole="link" onPress={() => void Linking.openURL(video)} style={styles.externalLink}><Ionicons name="play-circle-outline" size={20} color={theme.colors.accent} /><Text style={[styles.externalLinkText, { color: theme.colors.accent }]} numberOfLines={1}>{t('profile.watchVideo')}</Text></Pressable>)}</View>}
          {profile.profileVideos.map((video) => <View key={video.id} style={[styles.mediaCard, { borderColor: theme.colors.border }]}><ProfileVideo uri={video.url} /><View style={styles.chips}>{video.tags.map((tag) => <ChoiceChip key={tag} label={tag} selected onPress={() => undefined} />)}</View>{profile.commentWallEnabled !== false && <FeedbackBlock targetType="video" targetId={video.id} title={t('feedback.videoTitle')} />}</View>)}
          {profile.commentWallEnabled !== false && profile.photos.map((photo) => <FeedbackBlock key={`feedback-${photo.id}`} targetType="photo" targetId={photo.id} title={t('feedback.photoTitle')} />)}
          <TrustBanner icon="shield-checkmark-outline" title={t('chat.safety')} body={t('location.lockedHint')} />
          <View style={styles.safetyRow}>
            <View style={styles.flex}><Button variant="secondary" icon="person-add-outline" label={t('social.addFriend')} onPress={() => void api.setFriendship(profile.id, 'request')} /></View>
            <View style={styles.flex}><Button variant="secondary" icon="star-outline" label={t('social.star')} onPress={() => void api.toggleStarredItem('friend', profile.id, profile.displayName)} /></View>
          </View>
          <Button icon="chatbubble-outline" label={t('profile.message')} onPress={() => void message()} />
          <Button variant="secondary" icon="lock-closed-outline" label={t('chat.shareAlbum')} onPress={() => router.push(`/albums/share?profileId=${profile.id}&name=${encodeURIComponent(profile.displayName)}`)} />
          <View style={styles.safetyRow}>
            <View style={styles.flex}><Button variant="secondary" icon="flag-outline" label={t('profile.report')} onPress={() => router.push(`/report/${profile.id}?name=${encodeURIComponent(profile.displayName)}`)} /></View>
            <View style={styles.flex}><Button variant="secondary" icon="ban-outline" label={t('profile.block')} onPress={block} /></View>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  loading: { minHeight: 500, alignItems: 'center', justifyContent: 'center' },
  hero: { height: 470, margin: 12, borderRadius: 32, overflow: 'hidden', backgroundColor: '#CBD5D1' },
  heroImage: { ...StyleSheet.absoluteFill },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  heroOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, paddingTop: 96, backgroundColor: 'rgba(0,0,0,.52)' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#70E5A5' },
  statusText: { color: 'rgba(255,255,255,.82)', fontSize: 12, fontWeight: '800' },
  heroName: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  heroMeta: { color: 'rgba(255,255,255,.84)', marginTop: 4, fontSize: 14 },
  body: { padding: 22, paddingTop: 12, gap: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { marginTop: 10 },
  safetyRow: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  extraSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 10 },
  externalLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  externalLinkText: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  video: { width: '100%', height: 220, borderRadius: 18, backgroundColor: '#090B0B' },
  mediaCard: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 10 },
  feedback: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, gap: 10 },
  feedbackTitle: { fontSize: 15, fontWeight: '900' },
  ratingRow: { flexDirection: 'row', gap: 18 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 15, paddingHorizontal: 9, paddingVertical: 6 },
  ratingPress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10 },
});
