import { FilterSection, GenderChoices } from '@/components/DiscoveryControls';
import { type Href } from 'expo-router';
import { Text } from '@/components/Typography';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, Field, Screen, TrustBanner, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { ProfileCustomization, InterestOrder } from '@/components/ProfileCustomization';
import { api } from '@/services';
import { profileTagById } from '@/data/profileTags';
import type { OwnProfile } from '@/types/domain';
import { parseProfileList, socialPlatforms, updateSocialHandle } from '@/utils/profileExtras';

export default function ProfileScreen() {
  const { discoveryEnabled, t, theme, locale } = useApp();
  const router = useRouter();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [interestText, setInterestText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [discoveryOpen,setDiscoveryOpen]=useState(false);
  const dirty = useRef(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setError(false);
    void api.getOwnProfile().then(value => {
      if (!active) return;
      if (dirty.current) {
        setProfile(current => current?.id === value.id ? { ...current, tags: value.tags, photos: value.photos, profileVideos: value.profileVideos } : value);
      } else { setProfile(value); setInterestText(value.interests.join(', ')); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry]));

  if (!profile) return <Screen title={t('tabs.profile')}><View style={styles.loading}><Text style={{ color: theme.colors.textMuted }}>{t(error ? 'profile.saveError' : 'common.loading')}</Text>{error && <Button label={t('common.retry')} onPress={() => setRetry(value => value + 1)} />}</View></Screen>;
  const patch = <K extends keyof OwnProfile>(key: K, value: OwnProfile[K]) => { dirty.current = true; setSaved(false); setProfile({ ...profile, [key]: value }); };

  const save = async () => {
    setBusy(true); setError(false); setSaved(false);
    try { const updated = await api.updateProfile({ ...profile, interests: parseProfileList(interestText, 12) }); setProfile(updated); setInterestText(updated.interests.join(', ')); dirty.current = false; setSaved(true); } catch { setError(true); } finally { setBusy(false); }
  };
  const addPhoto = async () => {
    if (profile.photos.length >= 6) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      await api.uploadProfilePhoto(result.assets[0].uri, result.assets[0].mimeType);
      const updated = await api.getOwnProfile();
      setProfile(current => current ? { ...current, photos: updated.photos, profileVideos: updated.profileVideos } : updated);
    }
  };
  const addVideo = async () => {
    if (profile.profileVideos.length >= 3) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 10, allowsEditing: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset?.uri) {
      await api.uploadProfileVideo(asset.uri, asset.mimeType, asset.duration ?? 0);
      const updated = await api.getOwnProfile();
      setProfile(current => current ? { ...current, photos: updated.photos, profileVideos: updated.profileVideos } : updated);
    }
  };

  return (
    <Screen title={t('tabs.profile')}>
      <View style={styles.page} pointerEvents={busy ? 'none' : 'auto'}>
        <FilterSection title={t('discovery.moreOptions')} open={discoveryOpen} onPress={()=>setDiscoveryOpen(!discoveryOpen)}><Button variant="secondary" label={t('diagnosis.title')} onPress={() => router.push('/diagnoses' as Href)} />
        {discoveryEnabled&&<><Text style={{ color: theme.colors.text, fontWeight: '700' }}>{t('discovery.gender')}</Text>
        <GenderChoices emptyLabel={locale==='is'?'Ekki tilgreint':'Not specified'} value={profile.gender ? [profile.gender] : []} onChange={values => patch('gender', values.at(-1) ?? null)} />
        <ChoiceChip label={t('discovery.fofOptIn')} selected={profile.friendsOfFriendsDiscovery === true} onPress={() => patch('friendsOfFriendsDiscovery', !profile.friendsOfFriendsDiscovery)} />
        <Text style={{ color: theme.colors.textMuted }}>{t('discovery.fofHelp')}</Text></>}</FilterSection>
        <TrustBanner icon="eye-outline" title={profile.isHidden ? t('profile.hidden') : t('profile.visible')} body={t('profile.photosHint')} />
        <View style={styles.photos}>
          {profile.photos.map((photo) => (
            <View key={photo.id} style={styles.photoWrap}>
              <Image source={photo.url} style={styles.photo} />
              {photo.status === 'pending' && <View style={styles.pending}><Text style={styles.pendingText}>{t('profile.photoPending')}</Text></View>}
              <Field label={t('profile.mediaTags')} value={(photo.tags ?? []).join(', ')} onChangeText={(value) => setProfile({ ...profile, photos: profile.photos.map((item) => item.id === photo.id ? { ...item, tags: parseProfileList(value, 10) } : item) })} onBlur={() => void api.updateProfileMediaTags('photo', photo.id, photo.tags ?? [])} />
            </View>
          ))}
        </View>
        <Button variant="secondary" icon="camera-outline" label={t('profile.addPhoto')} disabled={profile.photos.length >= 6} onPress={() => void addPhoto()} />
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.photosHint')}</Text>
        <ProfileCustomization profile={profile} patch={patch} />
        <Field label={t('profile.name')} value={profile.displayName} onChangeText={(value) => patch('displayName', value)} />
        <Field label={t('profile.pronouns')} value={profile.pronouns ?? ''} onChangeText={(value) => patch('pronouns', value)} />
        <Field label={t('profile.bio')} value={profile.bio} onChangeText={(value) => patch('bio', value)} multiline />
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.videos')}</Text>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.videosHint')}</Text>
          <Field label={t('profile.videoLinks')} value={profile.videos.join('\n')} onChangeText={(value) => patch('videos', parseProfileList(value, 3))} placeholder={t('profile.videoLinksPlaceholder')} multiline />
          <Button variant="secondary" icon="videocam-outline" label={t('profile.addVideo')} disabled={profile.profileVideos.length >= 3} onPress={() => void addVideo()} />
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.videoUploadHint')}</Text>
          {profile.profileVideos.map((video) => <Field key={video.id} label={t('profile.mediaTags')} value={video.tags.join(', ')} onChangeText={(value) => setProfile({ ...profile, profileVideos: profile.profileVideos.map((item) => item.id === video.id ? { ...item, tags: parseProfileList(value, 10) } : item) })} onBlur={() => void api.updateProfileMediaTags('video', video.id, video.tags)} />)}
          <Field label={t('profile.customTags')} value={profile.customTags.join(', ')} onChangeText={(value) => patch('customTags', parseProfileList(value, 20))} placeholder={t('profile.customTagsPlaceholder')} multiline />
        </View>
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.socials')}</Text>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.socialsHint')}</Text>
          {socialPlatforms.map(({ platform, labelKey }) => (
            <Field
              key={platform}
              label={t(labelKey)}
              value={profile.socials.find((social) => social.platform === platform)?.handle ?? ''}
              onChangeText={(value) => patch('socials', updateSocialHandle(profile.socials, platform, value))}
            />
          ))}
        </View>
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.interests')}</Text>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.interestsHint')}</Text>
          <Field label={t('profile.interests')} value={interestText} onChangeText={value => { dirty.current = true; setInterestText(value); setSaved(false); }} placeholder={t('profile.interestsPlaceholder')} multiline />
          <InterestOrder interests={parseProfileList(interestText, 12)} onChange={items => { setInterestText(items.join(', ')); patch('interests', items); }} />
        </View>
        <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.tags')}</Text>
        <View style={styles.tags}>{profile.tags.map((id) => <ChoiceChip key={id} label={profileTagById.get(id)?.label ?? id} selected onPress={() => router.push('/my-tags')} />)}</View>
        <Button variant="secondary" icon="pricetags-outline" label={t('profile.editTags')} onPress={() => router.push('/my-tags')} />
        <Button variant="secondary" icon="lock-closed-outline" label={t('albums.manage')} onPress={() => router.push('/albums' as never)} />
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.socialPrivacy')}</Text>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.socialPrivacyHint')}</Text>
          <View style={styles.tags}>
            <ChoiceChip label={t('profile.wallOn')} selected={profile.commentWallEnabled !== false} onPress={() => patch('commentWallEnabled', profile.commentWallEnabled === false)} />
          </View>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.starAudience')}</Text>
          <View style={styles.tags}>{(['everyone', 'friends', 'no_one'] as const).map((audience) => <ChoiceChip key={audience} label={t(`social.audience.${audience}`)} selected={(profile.starredProfileAudience ?? 'no_one') === audience} onPress={() => patch('starredProfileAudience', audience)} />)}</View>
        </View>
        <View style={styles.visibility}>
          <ChoiceChip label={profile.isHidden ? t('profile.hidden') : t('profile.visible')} selected={!profile.isHidden} onPress={() => patch('isHidden', !profile.isHidden)} />
        </View>
        {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('profile.saveError')}</Text>}
        {saved && <Text accessibilityRole="alert" style={{ color: theme.colors.success }}>{t('profile.saveSuccess')}</Text>}
        <Button label={t('common.save')} loading={busy} onPress={() => void save()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  loading: { minHeight: 400, alignItems: 'center', justifyContent: 'center' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap: { width: '48%', minHeight: 270, borderRadius: 16, overflow: 'hidden' },
  photo: { height: 160 },
  pending: { position: 'absolute', left: 5, right: 5, bottom: 5, padding: 5, backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 8 },
  pendingText: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 17 },
  visibility: { alignItems: 'flex-start' },
  sectionLabel: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  sectionBlock: { gap: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
