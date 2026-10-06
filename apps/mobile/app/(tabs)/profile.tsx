import { GenderChoices } from '@/components/DiscoveryControls';
import { Ionicons } from '@expo/vector-icons';
import { ExpandableProfileSection, IntentCards } from '@/components/ProfileSetup';
import { profileSetupCopy } from '@/i18n/profileSetup';
import { type Href } from 'expo-router';
import { Text } from '@/components/Typography';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, Field, IconButton, Screen } from '@/components/ui';
import { profileActivityCopy } from '@/i18n/profileActivity';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { ProfileCustomization, InterestOrder } from '@/components/ProfileCustomization';
import { api } from '@/services';
import { profileTagById } from '@/data/profileTags';
import type { IcelandRegion, OwnProfile } from '@/types/domain';
import { parseProfileList, profileIdentityChoices, socialPlatforms, toggleProfileIdentity, updateSocialHandle } from '@/utils/profileExtras';

const regions: IcelandRegion[] = ['capital', 'south', 'west', 'westfjords', 'north', 'east'];

export default function ProfileScreen() {
  const { discoveryEnabled, t, theme, locale } = useApp();
  const { reducedMotion } = useAppearance();
  const router = useRouter();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [interestText, setInterestText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaPicking = useRef(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const copy = profileSetupCopy(locale);
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
  const toggleSection = (key: string) => setOpenSection(current => current === key ? null : key);
  const selectedPhoto = profile.photos.find(photo => photo.id === selectedPhotoId);
  const primaryPhoto = profile.photos.find(photo => photo.status === 'approved');
  const coverPhoto = profile.photos.find(photo => photo.id === profile.coverPhotoId && photo.status === 'approved') ?? primaryPhoto;

  const save = async () => {
    if (busy || mediaPicking.current) return;
    setBusy(true); setError(false); setSaved(false);
    try { const updated = await api.updateProfile({ ...profile, interests: parseProfileList(interestText, 12) }); setProfile(updated); setInterestText(updated.interests.join(', ')); dirty.current = false; setSaved(true); } catch { setError(true); } finally { setBusy(false); }
  };
  const addMedia = async (kind: 'photo' | 'video') => {
    if (mediaPicking.current || busy || (kind === 'photo' ? profile.photos.length >= 6 : profile.profileVideos.length >= 3)) return;
    mediaPicking.current = true; setUploading(true); setError(false);
    try {
      const result = kind === 'photo'
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 10, allowsEditing: true });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset?.uri) return;
      if (kind === 'photo') await api.uploadProfilePhoto(asset.uri, asset.mimeType);
      else await api.uploadProfileVideo(asset.uri, asset.mimeType, asset.duration ?? 0);
      const updated = await api.getOwnProfile();
      setProfile(current => current ? { ...current, photos: updated.photos, profileVideos: updated.profileVideos } : updated);
    } catch { setError(true); } finally { mediaPicking.current = false; setUploading(false); }
  };

  return (
    <Screen scroll={false} title={t('tabs.profile')} right={<IconButton icon="flame-outline" label={profileActivityCopy(locale).title} onPress={() => router.push('/interest' as Href)} />}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page} pointerEvents={busy ? 'none' : 'auto'}>
        <View style={styles.summary}>
          {primaryPhoto ? <Image source={primaryPhoto.url} style={styles.avatar} contentFit="cover" /> : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.colors.surfaceRaised }]}><Ionicons name="person-outline" size={30} color={theme.colors.textMuted} /></View>}
          <View style={styles.summaryCopy}><Text style={[styles.name, { color: theme.colors.text }]}>{profile.displayName}, {profile.age}</Text><Text style={[styles.hint, { color: theme.colors.textMuted }]}>{[profile.pronouns, t(`region.${profile.region}`)].filter(Boolean).join(' · ')}</Text><View style={styles.statusRow}><Ionicons name={profile.isHidden ? 'eye-off-outline' : 'eye-outline'} size={14} color={theme.colors.accent} /><Text style={[styles.hint, { color: theme.colors.accent }]}>{t(profile.isHidden ? 'profile.hidden' : 'profile.visible')}</Text></View></View>
        </View>
        <View style={styles.sectionHeading}><Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{copy.photos}</Text><Text style={[styles.hint, { color: theme.colors.textMuted }]}>{profile.photos.length}/6</Text></View>
        <View style={styles.photos}>
          {profile.photos.map((photo, index) => (
            <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`${t('profile.mediaTags')} ${index + 1}`} accessibilityState={{ selected: selectedPhotoId === photo.id }} onPress={() => setSelectedPhotoId(current => current === photo.id ? null : photo.id)} style={[styles.photoWrap, { borderColor: selectedPhotoId === photo.id ? theme.colors.accent : theme.colors.border }]}>
              <Image source={photo.url} style={styles.photo} contentFit="cover" />
              {photo.status === 'pending' && <View style={styles.pending}><Text style={styles.pendingText}>{t('profile.photoPending')}</Text></View>}
              <View style={styles.photoEdit}><Ionicons name="pencil" size={13} color="white" /></View>
            </Pressable>
          ))}
          {Array.from({ length: Math.max(0, 6 - profile.photos.length) }, (_, index) => <Pressable key={`empty-${index}`} accessibilityRole="button" accessibilityLabel={t('profile.addPhoto')} accessibilityState={{ disabled: uploading }} disabled={uploading} onPress={() => void addMedia('photo')} style={[styles.photoWrap, styles.emptyPhoto, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised }]}><Ionicons name="add" size={27} color={theme.colors.accent} />{index === 0 && <Text style={[styles.addPhotoLabel, { color: theme.colors.textMuted }]}>{copy.addPhoto}</Text>}</Pressable>)}
        </View>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.photosHint')}</Text>
        {uploading && <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: theme.colors.accent }]}>{t('common.loading')}</Text>}
        {selectedPhoto ? <Field label={t('profile.mediaTags')} value={(selectedPhoto.tags ?? []).join(', ')} onChangeText={value => setProfile({ ...profile, photos: profile.photos.map(item => item.id === selectedPhoto.id ? { ...item, tags: parseProfileList(value, 10) } : item) })} onBlur={() => void api.updateProfileMediaTags('photo', selectedPhoto.id, selectedPhoto.tags ?? []).catch(() => setError(true))} /> : profile.photos.length > 0 && <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{copy.mediaTags}</Text>}
        <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{copy.basicsSection}</Text>
        <Field label={t('profile.name')} value={profile.displayName} onChangeText={(value) => patch('displayName', value)} />
        <Field label={t('profile.pronouns')} value={profile.pronouns ?? ''} onChangeText={(value) => patch('pronouns', value)} />
        <Field label={t('profile.bio')} value={profile.bio} onChangeText={(value) => patch('bio', value)} multiline />
        <ExpandableProfileSection title={t('profile.lookingFor')} summary={profile.lookingFor.map(intent => t(`intent.${intent}`)).join(' · ')} icon="heart-outline" open={openSection === 'intentions'} onPress={() => toggleSection('intentions')}><IntentCards value={profile.lookingFor} onChange={value => patch('lookingFor', value)} /></ExpandableProfileSection>
        <ExpandableProfileSection title={t('profile.identity')} summary={profile.identity.map(identity => t(`identity.${identity}`)).join(' · ')} icon="person-outline" open={openSection === 'identity'} onPress={() => toggleSection('identity')}>
          <View style={styles.tags}>{profileIdentityChoices.map(identity => <ChoiceChip key={identity} label={t(`identity.${identity}`)} selected={profile.identity.includes(identity)} onPress={() => patch('identity', toggleProfileIdentity(identity, profile.identity))} />)}</View>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.region')}</Text><View style={styles.tags}>{regions.map(region => <ChoiceChip key={region} label={t(`region.${region}`)} selected={profile.region === region} onPress={() => patch('region', region)} />)}</View>
        </ExpandableProfileSection>
        <ExpandableProfileSection title={copy.customization} icon="color-palette-outline" open={openSection === 'customization'} onPress={() => toggleSection('customization')}><ProfileCustomization profile={profile} patch={patch} /></ExpandableProfileSection>
        <ExpandableProfileSection title={copy.privacy} summary={t(profile.isHidden ? 'profile.hidden' : 'profile.visible')} icon="shield-checkmark-outline" open={openSection === 'privacy'} onPress={() => toggleSection('privacy')}>
        <Button variant="secondary" label={t('diagnosis.title')} onPress={() => router.push('/diagnoses' as Href)} />
        {discoveryEnabled&&<><Text style={{ color: theme.colors.text, fontWeight: '700' }}>{t('discovery.gender')}</Text>
        <GenderChoices emptyLabel={locale==='is'?'Ekki tilgreint':'Not specified'} value={profile.gender ? [profile.gender] : []} onChange={values => patch('gender', values.at(-1) ?? null)} />
        <ChoiceChip label={t('discovery.fofOptIn')} selected={profile.friendsOfFriendsDiscovery === true} onPress={() => patch('friendsOfFriendsDiscovery', !profile.friendsOfFriendsDiscovery)} />
        <Text style={{ color: theme.colors.textMuted }}>{t('discovery.fofHelp')}</Text></>}
          <View style={styles.visibility}><ChoiceChip label={profile.isHidden ? t('profile.hidden') : t('profile.visible')} selected={!profile.isHidden} onPress={() => patch('isHidden', !profile.isHidden)} /></View>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.socialPrivacyHint')}</Text><ChoiceChip label={t('profile.wallOn')} selected={profile.commentWallEnabled !== false} onPress={() => patch('commentWallEnabled', profile.commentWallEnabled === false)} />
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.starAudience')}</Text><View style={styles.tags}>{(['everyone', 'friends', 'no_one'] as const).map(audience => <ChoiceChip key={audience} label={t(`social.audience.${audience}`)} selected={(profile.starredProfileAudience ?? 'no_one') === audience} onPress={() => patch('starredProfileAudience', audience)} />)}</View>
        </ExpandableProfileSection>
        <ExpandableProfileSection title={t('profile.videos')} summary={`${profile.profileVideos.length}/3`} icon="videocam-outline" open={openSection === 'videos'} onPress={() => toggleSection('videos')}>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.videosHint')}</Text>
          <Field label={t('profile.videoLinks')} value={profile.videos.join('\n')} onChangeText={(value) => patch('videos', parseProfileList(value, 3))} placeholder={t('profile.videoLinksPlaceholder')} multiline />
          <Button variant="secondary" icon="videocam-outline" label={t('profile.addVideo')} loading={uploading} disabled={profile.profileVideos.length >= 3} onPress={() => void addMedia('video')} />
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.videoUploadHint')}</Text>
          {profile.profileVideos.map((video) => <Field key={video.id} label={t('profile.mediaTags')} value={video.tags.join(', ')} onChangeText={(value) => setProfile({ ...profile, profileVideos: profile.profileVideos.map((item) => item.id === video.id ? { ...item, tags: parseProfileList(value, 10) } : item) })} onBlur={() => void api.updateProfileMediaTags('video', video.id, video.tags).catch(() => setError(true))} />)}
        </ExpandableProfileSection>
        <ExpandableProfileSection title={t('profile.socials')} summary="Instagram" icon="logo-instagram" open={openSection === 'socials'} onPress={() => toggleSection('socials')}>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.socialsHint')}</Text>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{copy.instagramHint}</Text>
          {[...socialPlatforms].sort((a, b) => Number(b.platform === 'instagram') - Number(a.platform === 'instagram')).map(({ platform, labelKey }) => (
            <Field
              key={platform}
              label={t(labelKey)}
              value={profile.socials.find((social) => social.platform === platform)?.handle ?? ''}
              onChangeText={(value) => patch('socials', updateSocialHandle(profile.socials, platform, value))}
            />
          ))}
        </ExpandableProfileSection>
        <ExpandableProfileSection title={copy.details} summary={parseProfileList(interestText, 12).slice(0, 3).join(' · ')} icon="pricetags-outline" open={openSection === 'interests'} onPress={() => toggleSection('interests')}>
          <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.interests')}</Text>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.interestsHint')}</Text>
          <Field label={t('profile.interests')} value={interestText} onChangeText={value => { dirty.current = true; setInterestText(value); setSaved(false); }} placeholder={t('profile.interestsPlaceholder')} multiline />
          <InterestOrder interests={parseProfileList(interestText, 12)} onChange={items => { setInterestText(items.join(', ')); patch('interests', items); }} />
        <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.tags')}</Text>
        <View style={styles.tags}>{profile.tags.map((id) => <ChoiceChip key={id} label={profileTagById.get(id)?.label ?? id} selected onPress={() => router.push('/my-tags')} />)}</View>
        <Button variant="secondary" icon="pricetags-outline" label={t('profile.editTags')} onPress={() => router.push('/my-tags')} />
        <Field label={t('profile.customTags')} value={profile.customTags.join(', ')} onChangeText={(value) => patch('customTags', parseProfileList(value, 20))} placeholder={t('profile.customTagsPlaceholder')} multiline />
        </ExpandableProfileSection>
        <Button variant="secondary" icon="lock-closed-outline" label={t('albums.manage')} onPress={() => router.push('/albums' as Href)} />
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: theme.colors.canvas, borderTopColor: theme.colors.border }]}>
        {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('profile.saveError')}</Text>}
        {saved && <Text accessibilityRole="alert" style={{ color: theme.colors.success }}>{t('profile.saveSuccess')}</Text>}
        {!saved && dirty.current && <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{copy.unsaved}</Text>}
        <View style={styles.footerActions}><View style={styles.flex}><Button variant="secondary" icon="eye-outline" label={copy.preview} onPress={() => setPreview(true)} /></View><View style={styles.flex}><Button label={t('common.save')} loading={busy} disabled={uploading} onPress={() => void save()} /></View></View>
      </View>
      </KeyboardAvoidingView>
      <Modal visible={preview} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setPreview(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.previewCard, { backgroundColor: theme.colors.canvas }]}>
          <View style={styles.previewHeading}><Text accessibilityRole="header" style={[styles.sectionLabel, { color: theme.colors.text }]}>{copy.previewTitle}</Text><IconButton icon="close" label={t('common.close')} onPress={() => setPreview(false)} /></View>
          <ScrollView contentContainerStyle={styles.previewContent}>
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{copy.previewHint}</Text>
            {coverPhoto && <Image source={coverPhoto.url} style={styles.previewPhoto} contentFit="cover" />}
            <Text style={[styles.name, { color: theme.colors.text }]}>{profile.displayName}, {profile.age}</Text>
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{[profile.pronouns, t(`region.${profile.region}`)].filter(Boolean).join(' · ')}</Text>
            <Text style={[styles.hint, { color: theme.colors.accent }]}>{profile.lookingFor.map(intent => t(`intent.${intent}`)).join(' · ')}</Text>
            {!!profile.bio && <Text style={{ color: theme.colors.text, lineHeight: 22 }}>{profile.bio}</Text>}
            {!!profile.conversationPrompt && <Text style={{ color: theme.colors.textMuted }}>{profile.conversationPrompt}</Text>}
            <View style={styles.tags}>{parseProfileList(interestText, 12).map(interest => <Text key={interest} style={[styles.previewTag, { backgroundColor: theme.colors.surfaceRaised, color: theme.colors.text }]}>{interest}</Text>)}</View>
            {profile.socials.map(social => <Text key={social.platform} style={{ color: theme.colors.textMuted }}>{social.platform}: {social.handle}</Text>)}
          </ScrollView>
        </View></View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 24, gap: 14 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryCopy: { flex: 1, gap: 5 },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 24, lineHeight: 30, fontWeight: '800' },
  statusRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loading: { minHeight: 400, alignItems: 'center', justifyContent: 'center' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap: { width: '31%', flexGrow: 1, aspectRatio: 0.88, borderRadius: 13, borderWidth: 2, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  emptyPhoto: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  addPhotoLabel: { fontSize: 10, textAlign: 'center', paddingHorizontal: 5 },
  photoEdit: { position: 'absolute', top: 6, right: 6, borderRadius: 12, padding: 5, backgroundColor: 'rgba(0,0,0,.55)' },
  pending: { position: 'absolute', left: 5, right: 5, bottom: 5, padding: 5, backgroundColor: 'rgba(0,0,0,.7)', borderRadius: 8 },
  pendingText: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 17 },
  visibility: { alignItems: 'flex-start' },
  sectionLabel: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  sectionBlock: { gap: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { paddingHorizontal: 16, paddingVertical: 10, gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  footerActions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  modalBackdrop: { flex: 1, padding: 16, backgroundColor: 'rgba(0,0,0,.7)', alignItems: 'center', justifyContent: 'center' },
  previewCard: { maxHeight: '85%', width: '100%', maxWidth: 480, borderRadius: 20, overflow: 'hidden' },
  previewHeading: { padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  previewPhoto: { width: '100%', height: 280, borderRadius: 14 },
  previewTag: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12 },
});
