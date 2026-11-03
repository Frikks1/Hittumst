import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, IconButton, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { OwnProfile } from '@/types/domain';
import { selectMainProfilePhoto } from '@/utils/mainProfilePhoto';
import { interestLabel } from '@/data/interestLabels';

export default function RestoredOwnProfile() {
  const { user, t, theme, locale } = useApp();
  const router = useRouter();
  const [state, setState] = useState<{ owner: string; profile: OwnProfile; counts: Array<number | null> } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  useFocusEffect(useCallback(() => {
    const request = ++revision.current;
    setError(false);
    if (!user) { setState(null); return; }
    void Promise.allSettled([api.getOwnProfile(), api.listFriends(), api.listStarredItems(), api.listMyMeetups()]).then(results => {
      if (request !== revision.current) return;
      const [profile, friends, stars, meetups] = results;
      if (profile.status === 'rejected') { setError(true); return; }
      setState({ owner: user.id, profile: profile.value, counts: [
        friends.status === 'fulfilled' ? friends.value.filter(friend => friend.direction === 'friend').length : null,
        stars.status === 'fulfilled' ? stars.value.length : null,
        meetups.status === 'fulfilled' ? meetups.value.filter(meetup => meetup.status !== 'draft' && meetup.status !== 'cancelled').length : null,
      ] });
    });
    return () => { revision.current++; };
  }, [user?.id, attempt]));
  const profile = state && state.owner === user?.id ? state.profile : null;
  const main = profile ? selectMainProfilePhoto(profile) : undefined;
  const links: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap; href: Href }> = [
    { label: locale === 'is' ? 'Albúmið mitt' : 'My albums', icon: 'images-outline', href: '/albums' },
    { label: locale === 'is' ? 'Tengdir reikningar' : 'Connected accounts', icon: 'link-outline', href: '/profile/socials' as Href },
    { label: locale === 'is' ? 'Öryggisstillingar' : 'Safety settings', icon: 'shield-checkmark-outline', href: '/privacy' },
  ];
  return <Screen><View style={styles.page}>
    <View style={styles.heading}><Text accessibilityRole="header" style={[styles.title, { color: theme.colors.accent }]}>{t('tabs.profile')}</Text><IconButton icon="settings-outline" label={t('settings.title')} onPress={() => router.push('/settings')} /></View>
    {!profile ? <View style={styles.loading}>{error ? <><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('profile.saveError')}</Text><Button label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} /></> : <ActivityIndicator color={theme.colors.accent} />}</View> : <>
      <View style={styles.identity}>
        <View style={[styles.ring, { borderColor: theme.colors.accent }]}>{main?.url ? <Image source={main.posterUrl ?? main.url} accessibilityLabel={profile.displayName} contentFit="cover" cachePolicy="memory" style={styles.picture} /> : <View style={[styles.picture, styles.placeholder, { backgroundColor: theme.colors.surface }]}><Ionicons name="person-outline" size={45} color={theme.colors.textMuted} /></View>}</View>
        <View style={styles.nameRow}><Text style={[styles.name, { color: theme.colors.text }]}>{profile.displayName}, {profile.age}</Text>{profile.showOnline && <View style={styles.online} />}</View>
        {!!profile.pronouns && <Text style={[styles.pronouns, { color: theme.colors.accent, backgroundColor: theme.colors.accentSoft }]}>{profile.pronouns}</Text>}
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/profile/edit' as Href)} style={[styles.edit, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}><Text style={[styles.editLabel, { color: theme.colors.text }]}>{t('profile.edit')}</Text></Pressable>
      <View style={styles.stats}>{[ { label: locale === 'is' ? 'vinir' : 'friends', href: '/friends' }, { label: locale === 'is' ? 'eftirlæti' : 'favorites', href: '/starred' }, { label: locale === 'is' ? 'hittingar' : 'meetups', href: '/hittingar/mine' } ].map((stat, index) => <Pressable key={stat.href} accessibilityRole="link" accessibilityLabel={`${state?.counts[index] ?? '—'} ${stat.label}`} onPress={() => router.push(stat.href as Href)} style={styles.stat}><Text style={[styles.count, { color: theme.colors.text }]}>{state?.counts[index] ?? '—'}</Text><Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{stat.label}</Text></Pressable>)}</View>
      <View style={styles.section}><Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.about')}</Text><Text style={[styles.bio, { color: theme.colors.text }]}>{profile.bio || (locale === 'is' ? 'Bættu við stuttri lýsingu á þér.' : 'Add a little about yourself.')}</Text></View>
      {!!profile.interests.length && <View style={styles.section}><Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.interests')}</Text><View style={styles.interests}>{profile.interests.map(interest => <Text key={interest} style={[styles.chip, { color: theme.colors.text, backgroundColor: theme.colors.surface }]}>{interestLabel(interest, locale)}</Text>)}</View></View>}
      <View style={styles.section}><Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{locale === 'is' ? 'Flýtitenglar' : 'Quick links'}</Text>{links.map(link => <Pressable key={link.label} accessibilityRole="link" onPress={() => router.push(link.href)} style={[styles.link, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Ionicons name={link.icon} size={20} color={theme.colors.textMuted} /><Text style={[styles.linkLabel, { color: theme.colors.text }]}>{link.label}</Text><Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} /></Pressable>)}</View>
    </>}
  </View></Screen>;
}

const styles = StyleSheet.create({ page: { width: '100%', maxWidth: 660, alignSelf: 'center', padding: 24, paddingBottom: 50, gap: 20 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { fontSize: 28, fontWeight: '800' }, identity: { alignItems: 'center', gap: 9 }, ring: { borderWidth: 2, padding: 3, borderRadius: 60 }, picture: { width: 96, height: 96, borderRadius: 48 }, placeholder: { alignItems: 'center', justifyContent: 'center' }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 }, name: { fontSize: 22, fontWeight: '800' }, online: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00D9AE' }, pronouns: { fontSize: 12, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12 }, edit: { borderWidth: 1, borderRadius: 20, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, editLabel: { fontSize: 14, fontWeight: '600' }, stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 3 }, stat: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 5 }, count: { fontSize: 22, fontWeight: '800' }, statLabel: { fontSize: 12 }, section: { gap: 10 }, eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' }, bio: { fontSize: 14, lineHeight: 21 }, interests: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { fontSize: 13, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, overflow: 'hidden' }, link: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 }, linkLabel: { flex: 1, fontSize: 15, fontWeight: '600' }, loading: { padding: 40, gap: 14 } });
