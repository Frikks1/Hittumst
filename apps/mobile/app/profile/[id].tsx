import { HostCommunity } from '@/features/hittingar/CommunityPanels';
import { Text, TextInput } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { confirmAction } from '@/utils/confirmAction';

import { VideoView, useVideoPlayer } from 'expo-video';
import { Button, ChoiceChip, Screen, TrustBanner, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { FavoriteButton } from '@/components/FavoriteButton';
import { useProfileTransition } from '@/providers/ProfileTransitionProvider';
import { PremiumProfile } from '@/components/PremiumProfile';
import { api } from '@/services';
import { profileTagById } from '@/data/profileTags';
import type { ContentReaction, ProfileReactionEmoji, PublicProfile, StarredItem } from '@/types/domain';
import { socialUrl } from '@/utils/profileExtras';

function ProfileVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri, useCaching: false }, (instance) => { instance.loop = true; instance.muted = true; });
  return <VideoView player={player} style={styles.video} contentFit="cover" nativeControls />;
}

function FeedbackBlock({ targetType, targetId, title }: { targetType: 'profile' | 'photo' | 'video'; targetId: string; title: string }) {
  const { theme, t } = useApp();
  const [feedback, setFeedback] = useState<{ ratings: Array<{ userId: string; value: -1 | 1 }>; comments: Array<{ id: string; authorName: string; body: string }>; reactions: ContentReaction[] }>({ ratings: [], comments: [], reactions: [] });
  const [comment, setComment] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<number | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const revision = generation.current;
    try { const next = await api.listFeedback(targetType, targetId); if (revision === generation.current) { setFeedback(next); setFailed(false); } }
    catch { if (revision === generation.current) setFailed(true); }
  }, [targetType, targetId]);
  useEffect(() => { generation.current++; setBusy(false); setFeedback({ ratings: [], comments: [], reactions: [] }); setComment(''); void load(); return () => { generation.current++; }; }, [load]);
  const run = async (task: () => Promise<unknown>, onSuccess?: () => void) => {
    const revision = generation.current;
    if (pending.current === revision) return;
    pending.current = revision; setBusy(true); setFailed(false);
    try { await task(); if (revision === generation.current) { onSuccess?.(); await load(); } }
    catch { if (revision === generation.current) setFailed(true); }
    finally { if (pending.current === revision) pending.current = null; if (revision === generation.current) setBusy(false); }
  };
  const showRatings = false; // Person ratings are excluded from the first release, including demo builds.
  const rate = (value: -1 | 1) => run(() => api.rateContent(targetType, targetId, value));
  const addComment = () => run(() => api.commentOnContent(targetType, targetId, comment), () => setComment(''));
  const react = (emoji: ProfileReactionEmoji) => run(() => api.toggleContentReaction(targetType, targetId, emoji));
  return <View style={[styles.feedback, { borderColor: theme.colors.border }]}>{failed && <View><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('privacy.actionFailed')}</Text><Button disabled={busy} variant="secondary" label={t('common.retry')} onPress={() => void load()} /></View>}<Text style={[styles.feedbackTitle, { color: theme.colors.text }]}>{showRatings ? title : t('feedback.community')}</Text><View style={styles.reactionRow}>{feedback.reactions.map((item) => <Pressable disabled={busy} key={item.emoji} accessibilityRole="button" accessibilityState={{ selected: item.reacted }} onPress={() => void react(item.emoji)} style={[styles.reaction, { borderColor: item.reacted ? theme.colors.accent : theme.colors.border, backgroundColor: item.reacted ? theme.colors.accentSoft : theme.colors.surface }]}><Text>{item.emoji}</Text><Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.count}</Text></Pressable>)}</View>{showRatings && <View style={styles.ratingRow}><Pressable accessibilityLabel={t('feedback.like')} onPress={() => void rate(1)} style={styles.ratingPress}><Ionicons name="thumbs-up-outline" size={19} color={theme.colors.text} /><Text style={{ color: theme.colors.text }}>{feedback.ratings.filter((r) => r.value === 1).length}</Text></Pressable><Pressable accessibilityLabel={t('feedback.dislike')} onPress={() => void rate(-1)} style={styles.ratingPress}><Ionicons name="thumbs-down-outline" size={19} color={theme.colors.text} /><Text style={{ color: theme.colors.text }}>{feedback.ratings.filter((r) => r.value === -1).length}</Text></Pressable><Text style={{ color: theme.colors.textMuted }}>{t('feedback.anonymous')}</Text></View>}<View style={styles.commentRow}><TextInput accessibilityLabel={t('feedback.commentPlaceholder')} editable={!busy} maxLength={2000} value={comment} onChangeText={setComment} placeholder={t('feedback.commentPlaceholder')} placeholderTextColor={theme.colors.textMuted} style={[styles.commentInput, { borderColor: theme.colors.border, color: theme.colors.text }]} /><Pressable accessibilityRole="button" disabled={busy || !comment.trim()} onPress={() => void addComment()}><Text style={{ color: theme.colors.accent, fontWeight: '800' }}>{t('feedback.comment')}</Text></Pressable></View>{feedback.comments.slice(0, 3).map((item) => <Text key={item.id} style={{ color: theme.colors.textMuted }}><Text style={{ fontWeight: '800', color: theme.colors.text }}>{item.authorName}: </Text>{item.body}</Text>)}</View>;
}

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { discoveryFilters, setDiscoveryFilters, t, theme, locationAllowed } = useApp();
  const transition = useProfileTransition();
  const hero = useRef<View>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [publicStars, setPublicStars] = useState<StarredItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef<number | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!id) return;
    const revision = generation.current;
    setLoading(true); setFailed(false);
    const results = await Promise.allSettled([api.getProfile(id), api.listStarredItems(id)]);
    if (revision !== generation.current) return;
    const [profileResult, stars] = results;
    if (profileResult.status === 'fulfilled') setProfile(profileResult.value); else setProfile(null);
    setPublicStars(stars.status === 'fulfilled' ? stars.value : []);
    setFailed(results.some(result => result.status === 'rejected')); setLoading(false);
  }, [id]);
  useEffect(() => { generation.current++; setBusy(false); setProfile(null); setNotice(''); void load(); return () => { generation.current++; }; }, [load]);
  const action = async <T,>(task: () => Promise<T>, onSuccess?: (value: T) => void) => {
    const revision = generation.current;
    if (pending.current === revision) return;
    pending.current = revision; setBusy(true); setFailed(false); setNotice('');
    try { const value = await task(); if (revision === generation.current) onSuccess?.(value); }
    catch { if (revision === generation.current) setFailed(true); }
    finally { if (pending.current === revision) pending.current = null; if (revision === generation.current) setBusy(false); }
  };
  if (!profile) return <Screen back><View style={{ padding: 22, gap: 16 }}>{loading ? <Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text> : <HostCommunity key={id} hostId={id} />}</View></Screen>;
  const message = () => {
    if (!locationAllowed) { router.push('/location-gate'); return; }
    return action(() => api.startConversation(profile.id), conversation => router.push(('/chat/' + conversation + '?name=' + encodeURIComponent(profile.displayName) + '&profileId=' + profile.id) as never));
  };
  const block = () => confirmAction({ title: t('block.confirmTitle', { name: profile.displayName }), message: t('block.confirmBody'), cancelLabel: t('common.cancel'), confirmLabel: t('block.action'), destructive: true,
    onConfirm: () => action(() => api.block(profile.id), () => router.replace('/(tabs)/discover')),
  });

  return (
    <Screen back>
      <View style={styles.page}>
        <View ref={hero} onLayout={() => hero.current?.measureInWindow((x, y, width, height) => transition.finish(profile.id, { x, y, width, height }))} style={styles.hero}>
          {profile.photos[0]?.url ? <Image source={profile.photos[0].url} style={styles.heroImage} /> : <View style={[styles.heroImage, styles.placeholder, { backgroundColor: theme.colors.surfaceMuted }]}><Ionicons name="person" size={70} color={theme.colors.textMuted} /></View>}
          <View style={styles.heroOverlay}>
            <View style={styles.statusLine}>
              {profile.isOnline && <View style={styles.onlineDot} />}
              <Text style={styles.statusText}>{profile.isOnline ? t('common.online') : profile.distanceBand ? t(`distance.${profile.distanceBand}`) : t(`region.${profile.region}`)}</Text>
            </View>
            <Text style={styles.heroName}>{profile.displayName}, {profile.age}</Text>
            <FavoriteButton key={profile.id} profileId={profile.id} name={profile.displayName} />
            {profile.diagnosisIds?.map(id=><Text key={id} style={styles.heroMeta}>{t(`diagnosis.${id}`)} · {t('diagnosis.approved')}</Text>)}
            <Text style={styles.heroMeta}>{profile.pronouns} · {profile.distanceBand ? t(`distance.${profile.distanceBand}`) : t(`region.${profile.region}`)}</Text>
          </View>
        </View>
        <View style={styles.body}>
          {failed && <View><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('privacy.actionFailed')}</Text><Button loading={loading} disabled={busy} variant="secondary" label={t('common.retry')} onPress={() => void load()} /></View>}
          {!!notice && <Text accessibilityRole="alert" style={{ color: theme.colors.text }}>{notice}</Text>}
          <PremiumProfile profileId={profile.id}/>
          <HostCommunity key={profile.id} hostId={profile.id} showTitle={false} />
          {profile.coverPhotoId && profile.photos.some(photo => photo.id === profile.coverPhotoId) && <Image source={profile.photos.find(photo => photo.id === profile.coverPhotoId)?.url} accessibilityLabel={t('profile.cover')} contentFit="cover" style={{ width: '100%', height: 170, borderRadius: 20 }} />}
          {!!profile.conversationPrompt && <View style={[styles.extraSection, { borderColor: theme.colors.accent }]}><Text style={[textStyles.eyebrow, { color: theme.colors.accent }]}>{t('profile.prompt')}</Text><Text style={[textStyles.heading, { color: theme.colors.text }]}>{profile.conversationPrompt}</Text><Button variant="secondary" label={t('profile.promptReply')} onPress={() => void message()} /></View>}
          {profile.commentWallEnabled !== false && <FeedbackBlock targetType="profile" targetId={profile.id} title={t('feedback.title')} />}
          {publicStars.length > 0 && <View style={[styles.extraSection, { borderColor: theme.colors.border }]}><Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{t('social.starred')}</Text><View style={styles.chips}>{publicStars.map((item) => <ChoiceChip key={item.id} label={item.label} selected onPress={() => undefined} />)}</View></View>}
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
            <View style={styles.flex}><Button variant="secondary" icon="person-add-outline" label={t('social.addFriend')} disabled={busy} onPress={() => void action(() => api.setFriendship(profile.id, 'request'), () => setNotice(t('common.done')))} /></View>
            <View style={styles.flex}></View>
          </View>
          <Button icon="chatbubble-outline" disabled={busy} label={t('profile.message')} onPress={() => void message()} />
          <Button variant="secondary" icon="lock-closed-outline" label={t('chat.shareAlbum')} onPress={() => router.push(`/albums/share?profileId=${profile.id}&name=${encodeURIComponent(profile.displayName)}`)} />
          <View style={styles.safetyRow}>
            <View style={styles.flex}><Button variant="secondary" icon="flag-outline" label={t('profile.report')} onPress={() => router.push(`/report/${profile.id}?name=${encodeURIComponent(profile.displayName)}`)} /></View>
            <View style={styles.flex}><Button variant="secondary" icon="ban-outline" disabled={busy} label={t('profile.block')} onPress={block} /></View>
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
