import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, EmptyState, IconButton, Screen } from '@/components/ui';
import { FavoriteButton } from '@/components/FavoriteButton';
import { useProfileTransition } from '@/providers/ProfileTransitionProvider';
import { profileActivityCopy } from '@/i18n/profileActivity';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { PublicProfile } from '@/types/domain';
import { selectMainProfilePhoto } from '@/utils/mainProfilePhoto';
import { confirmAction } from '@/utils/confirmAction';
import { socialUrl } from '@/utils/profileExtras';
import { interestLabel } from '@/data/interestLabels';

export default function RestoredPublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, locationAllowed, t, locale, theme } = useApp();
  const router = useRouter();
  const copy = profileActivityCopy(locale);
  const transition = useProfileTransition();
  const hero = useRef<View>(null);
  const { height } = useWindowDimensions();
  const [state, setState] = useState<{ key: string; profile: PublicProfile } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [notice, setNotice] = useState('');
  const [more, setMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  const pending = useRef(false);
  const key = user && id && locationAllowed ? `${user.id}:${id}` : null;
  const profile = key && state?.key === key ? state.profile : null;
  useEffect(() => {
    const current = ++revision.current;
    setState(null); setLoading(Boolean(key)); setError(false); setBusy(false); setTapped(false); setNotice(''); setMore(false);
    if (!key) return;
    void api.getProfile(id).then(value => { if (current === revision.current) setState({ key, profile: value }); }).catch(() => { if (current === revision.current) setError(true); }).finally(() => { if (current === revision.current) setLoading(false); });
    return () => { revision.current++; };
  }, [key, attempt, id]);
  useFocusEffect(useCallback(() => {
    if (profile && user && profile.id !== user.id) void api.recordProfileView(profile.id).catch(() => undefined);
  }, [profile?.id, user?.id]));
  const run = async <T,>(action: () => Promise<T>, onSuccess?: (value: T) => void) => {
    if (pending.current) return;
    const current = revision.current;
    pending.current = true; setBusy(true); setError(false); setNotice('');
    try { const result = await action(); if (current === revision.current) onSuccess?.(result); }
    catch (failure) { if (current === revision.current) {
      const message = failure instanceof Error ? failure.message : String(failure);
      if (/tap_cooldown/.test(message)) { setTapped(true); setNotice(copy.tapCooldown); }
      else if (/tap_rate_limited/.test(message)) setNotice(copy.tapRateLimited);
      else setError(true);
    } }
    finally { pending.current = false; if (current === revision.current) setBusy(false); }
  };
  if (!locationAllowed) return <Screen back><EmptyState icon="location-outline" title={t('location.staleTitle')} body={t('location.lockedHint')} action={<Button label={t('location.verifyAgain')} onPress={() => router.push('/location-gate')} />} /></Screen>;
  if (!profile) return <Screen back><View style={styles.loading}>{loading ? <ActivityIndicator color={theme.colors.accent} /> : <EmptyState icon="person-outline" title={copy.profileUnavailable} body={copy.profileUnavailableBody} action={<Button variant="secondary" label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} />} />}</View></Screen>;
  const main = selectMainProfilePhoto(profile);
  const message = () => run(() => api.startConversation(profile.id), conversation => router.push({ pathname: '/chat/[id]', params: { id: conversation, name: profile.displayName, profileId: profile.id } }));
  const block = () => confirmAction({ title: t('block.confirmTitle', { name: profile.displayName }), message: t('block.confirmBody'), cancelLabel: t('common.cancel'), confirmLabel: t('block.action'), destructive: true, onConfirm: () => run(() => api.block(profile.id), () => router.replace('/(tabs)/discover')) });
  return <Screen footer={profile.id !== user?.id ? <View style={styles.contact}>{!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>{notice}</Text>}<View style={styles.contactRow}><View style={{ flex: 1 }}><Button icon="chatbubble-outline" disabled={busy} label={t('profile.message')} onPress={() => void message()} /></View><Button variant="secondary" icon={tapped ? 'checkmark' : 'flame-outline'} disabled={busy || tapped} label={tapped ? copy.tapped : copy.tap} onPress={() => void run(() => api.sendProfileTap(profile.id), () => setTapped(true))} /></View></View> : undefined}>
    <View style={styles.page}>
      <View ref={hero} onLayout={() => hero.current?.measureInWindow((x, y, width, measuredHeight) => transition.finish(profile.id, { x, y, width, height: measuredHeight }))} style={[styles.hero, { height: Math.max(280, Math.min(380, height * 0.44)), backgroundColor: theme.colors.surface }]}>
        {main?.url ? <Image source={main.posterUrl ?? main.url} contentFit="cover" accessibilityLabel={profile.displayName} cachePolicy="memory" style={StyleSheet.absoluteFill} /> : <Ionicons name="person-outline" size={90} color={theme.colors.textMuted} />}
        <LinearGradient colors={['transparent', theme.colors.canvas]} locations={[0.45, 1]} style={styles.gradient}><View style={styles.nameRow}><Text style={[styles.name, { color: theme.colors.text }]}>{profile.displayName}, {profile.age}</Text>{profile.isOnline && <View style={styles.online} />}</View>{!!profile.pronouns && <Text style={{ color: theme.colors.accent, fontSize: 12 }}>{profile.pronouns}</Text>}<Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{profile.distanceBand ? t(`distance.${profile.distanceBand}`) : t(`region.${profile.region}`)}</Text></LinearGradient>
        <View style={styles.heroActions}><IconButton icon="arrow-back" label={t('common.back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/discover')} /><IconButton icon="ellipsis-horizontal" label={locale === 'is' ? 'Fleiri aðgerðir' : 'More actions'} onPress={() => setMore(value => !value)} /></View>
      </View>
      <View style={styles.body}>
        {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('privacy.actionFailed')}</Text>}
        {more && profile.id !== user?.id && <View style={[styles.options, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><FavoriteButton profileId={profile.id} name={profile.displayName} /><Button variant="ghost" disabled={busy} label={t('social.addFriend')} onPress={() => void run(() => api.setFriendship(profile.id, 'request'), () => setNotice(locale === 'is' ? 'Vinabeiðni send' : 'Friend request sent'))} /><Button variant="ghost" label={t('chat.shareAlbum')} onPress={() => router.push(`/albums/share?profileId=${profile.id}&name=${encodeURIComponent(profile.displayName)}`)} /><Button variant="ghost" label={t('block.action')} onPress={block} /><Button variant="ghost" label={t('report.title')} onPress={() => router.push(`/report/${profile.id}`)} /></View>}
        {!!profile.lookingFor.length && <View style={styles.section}><Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.intent')}</Text><View style={styles.chips}>{profile.lookingFor.map(intent => <Text key={intent} style={[styles.chip, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>{t(`intent.${intent}`)}</Text>)}</View></View>}
        <View style={styles.section}><Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.about')}</Text><Text style={[styles.bio, { color: theme.colors.text }]}>{profile.bio}</Text></View>
        {!!profile.interests.length && <View style={styles.section}><Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{t('profile.interests')}</Text><View style={styles.chips}>{profile.interests.map(interest => <Text key={interest} style={[styles.chip, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>{interestLabel(interest, locale)}</Text>)}</View></View>}
        {!!profile.socials.length && <View style={styles.section}>{profile.socials.map(social => <Button key={social.platform} variant="ghost" icon="open-outline" label={t(`profile.${social.platform}`)} onPress={() => { const url = socialUrl(social); if (url) void Linking.openURL(url).catch(() => setError(true)); }} />)}</View>}
        <View style={[styles.locationHint, { backgroundColor: theme.colors.surface }]}><Ionicons name="location-outline" size={17} color={theme.colors.textMuted} /><Text style={{ color: theme.colors.textMuted, flex: 1, fontSize: 12 }}>{locale === 'is' ? 'Staðsetning er áætluð til að tryggja öryggi.' : 'Location is approximate for your safety.'}</Text></View>
      </View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({ page: { width: '100%', maxWidth: 720, alignSelf: 'center' }, hero: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, heroActions: { position: 'absolute', top: 24, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between' }, gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 70, paddingBottom: 20, gap: 6 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, name: { fontSize: 26, fontWeight: '800' }, online: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00D9AE' }, body: { padding: 24, gap: 24 }, section: { gap: 12 }, eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }, bio: { fontSize: 14, lineHeight: 21 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, fontSize: 13, overflow: 'hidden' }, locationHint: { padding: 12, borderRadius: 12, flexDirection: 'row', gap: 8 }, contact: { gap: 8 }, contactRow: { flexDirection: 'row', gap: 12 }, options: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 }, loading: { padding: 40 } });
