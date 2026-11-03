import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, Field, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { OwnProfile, Intent } from '@/types/domain';
import { confirmAction } from '@/utils/confirmAction';
import { selectMainProfilePhoto } from '@/utils/mainProfilePhoto';
import { parseProfileList, profileIdentityChoices, supportedSocialPlatforms, toggleProfileIdentity, updateSocialHandle } from '@/utils/profileExtras';

export default function RestoredProfileEditor({ socialsOnly = false }: { socialsOnly?: boolean }) {
  const { user, locale, t, theme } = useApp();
  const router = useRouter();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [interests, setInterests] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [details, setDetails] = useState(false);
  const dirty = useRef(false);
  const pending = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    const current = ++revision.current;
    setProfile(null); setLoadedOwner(null); dirty.current = false; setBusy(false); setUploading(false); setUploaded(false); setError(false);
    if (!user) return;
    void api.getOwnProfile().then(value => { if (current === revision.current) { setProfile(value); setLoadedOwner(user.id); setInterests(value.interests.join(', ')); } }).catch(() => { if (current === revision.current) setError(true); });
    return () => { revision.current++; };
  }, [user?.id, attempt]);
  const currentProfile = loadedOwner === user?.id ? profile : null;
  const patch = (values: Partial<OwnProfile>) => { dirty.current = true; setProfile(value => value ? { ...value, ...values } : value); };
  const leave = () => {
    const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile');
    if (!dirty.current) { back(); return; }
    confirmAction({ title: locale === 'is' ? 'Óvistaðar breytingar' : 'Unsaved changes', message: locale === 'is' ? 'Fara án þess að vista?' : 'Leave without saving?', cancelLabel: t('common.cancel'), confirmLabel: locale === 'is' ? 'Fara' : 'Leave', onConfirm: back });
  };
  const save = async () => {
    if (!currentProfile || pending.current) return;
    const current = revision.current;
    pending.current = true; setBusy(true); setError(false);
    try {
      const updated = await api.updateProfile(socialsOnly ? { socials: currentProfile.socials } : {
        displayName: currentProfile.displayName, pronouns: currentProfile.pronouns, bio: currentProfile.bio,
        interests: parseProfileList(interests, 12), lookingFor: currentProfile.lookingFor, identity: currentProfile.identity,
      });
      if (current !== revision.current) return;
      setProfile(updated); dirty.current = false;
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/profile');
    } catch { if (current === revision.current) setError(true); }
    finally { pending.current = false; if (current === revision.current) setBusy(false); }
  };
  const upload = async () => {
    if (!currentProfile || pending.current) return;
    const current = revision.current;
    pending.current = true; setUploading(true); setError(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('photo_permission_required');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (result.canceled || current !== revision.current) return;
      const asset = result.assets[0];
      if (!asset) return;
      await api.uploadProfilePhoto(asset.uri, asset.mimeType ?? 'image/jpeg');
      if (current !== revision.current) return;
      setUploaded(true);
      const refreshed = await api.getOwnProfile();
      if (current === revision.current) setProfile(value => value ? { ...value, photos: refreshed.photos, coverPhotoId: refreshed.coverPhotoId, mainPhotoUpload: refreshed.mainPhotoUpload } : value);
    } catch { if (current === revision.current) setError(true); }
    finally { pending.current = false; if (current === revision.current) setUploading(false); }
  };
  const main = currentProfile ? selectMainProfilePhoto(currentProfile) : undefined;
  const pendingPhoto = currentProfile?.mainPhotoUpload;
  return <Screen back onBack={leave} title={socialsOnly ? (locale === 'is' ? 'Tengdir reikningar' : 'Connected accounts') : t('profile.edit')}
    footer={currentProfile ? <Button loading={busy} disabled={uploading} label={t('profile.save')} onPress={() => void save()} /> : undefined}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
      {error && <View style={styles.section}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('profile.saveError')}</Text>{!currentProfile && <Button label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} />}</View>}
      {!currentProfile ? !error && <ActivityIndicator color={theme.colors.accent} /> : socialsOnly ? <>
        {supportedSocialPlatforms.map(platform => <Field key={platform} label={t(`profile.${platform}`)} value={currentProfile.socials.find(social => social.platform === platform)?.handle ?? ''} onChangeText={handle => patch({ socials: updateSocialHandle(currentProfile.socials, platform, handle) })} maxLength={500} />)}
      </> : <>
        <View style={styles.photoSection}><View style={[styles.photo, { backgroundColor: theme.colors.surface }]}>{main?.url ? <Image source={main.posterUrl ?? main.url} style={styles.photo} contentFit="cover" accessibilityLabel={currentProfile.displayName} /> : <Ionicons name="person-outline" size={48} color={theme.colors.textMuted} />}</View><Button variant="secondary" icon="camera-outline" loading={uploading} disabled={busy} label={locale === 'is' ? 'Breyta aðalmynd' : 'Change main picture'} onPress={() => void upload()} /></View>
        {(uploaded || pendingPhoto) && <Text accessibilityLiveRegion="polite" style={{ color: pendingPhoto?.status === 'rejected' ? theme.colors.danger : theme.colors.textMuted }}>{pendingPhoto?.status === 'rejected' ? (locale === 'is' ? 'Myndin var ekki samþykkt. Veldu aðra mynd.' : 'The picture was not approved. Choose another picture.') : (locale === 'is' ? 'Nýja myndin bíður yfirferðar. Núverandi aðalmynd helst sýnileg.' : 'Your new picture is awaiting review. Your current main picture stays visible.')}</Text>}
        <Field label={t('profile.displayName')} value={currentProfile.displayName} onChangeText={displayName => patch({ displayName })} maxLength={50} />
        <Field label={locale === 'is' ? 'Fornöfn' : 'Pronouns'} value={currentProfile.pronouns ?? ''} onChangeText={pronouns => patch({ pronouns })} maxLength={50} />
        <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Aldur' : 'Age'}: {currentProfile.age}</Text>
        <Field label={t('profile.about')} value={currentProfile.bio} onChangeText={bio => patch({ bio })} maxLength={500} multiline />
        <Field label={t('profile.interests')} value={interests} onChangeText={value => { dirty.current = true; setInterests(value); }} maxLength={972} />
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>{t('profile.intent')}</Text>
        <View style={styles.choices}>{(['chat', 'dates', 'friends', 'relationship'] as Intent[]).map(intent => <ChoiceChip key={intent} label={t(`intent.${intent}`)} selected={currentProfile.lookingFor.includes(intent)} onPress={() => patch({ lookingFor: currentProfile.lookingFor.includes(intent) ? currentProfile.lookingFor.filter(value => value !== intent) : [...currentProfile.lookingFor, intent] })} />)}</View>
        <Button variant="ghost" label={locale === 'is' ? 'Sjálfsmynd' : 'Identity'} onPress={() => setDetails(value => !value)} />
        {details && <View style={styles.choices}>{profileIdentityChoices.map(identity => <ChoiceChip key={identity} label={t(`identity.${identity}`)} selected={currentProfile.identity.includes(identity)} onPress={() => patch({ identity: toggleProfileIdentity(identity, currentProfile.identity) })} />)}</View>}
      </>}
    </KeyboardAvoidingView>
  </Screen>;
}

const styles = StyleSheet.create({ page: { width: '100%', maxWidth: 660, alignSelf: 'center', padding: 24, gap: 18, paddingBottom: 30 }, section: { gap: 12 }, photoSection: { alignItems: 'center', gap: 14 }, photo: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' }, label: { fontSize: 13, fontWeight: '600' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
