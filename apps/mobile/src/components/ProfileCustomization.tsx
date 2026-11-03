import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, Field, IconButton, textStyles } from './ui';
import { Text } from './Typography';
import { ProfileAvatar, ProfileBanner, useProfilePalette } from './ProfileAppearance';
import { profileAppearanceCopy } from '@/i18n/profileAppearance';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { defaultProfileAppearance, normalizeProfileAppearance, profilePalettes, type ProfileAppearance } from '@/utils/profileAppearance';
import type { OwnProfile } from '@/types/domain';

type Tab = 'themes' | 'banners' | 'effects' | 'avatar';
type Option<T extends string> = { value: T; label: string; icon: keyof typeof Ionicons.glyphMap; colors?: readonly [string, string, ...string[]] };

function StyleOptions<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange: (value: T) => void }) {
  const { theme } = useApp();
  return <View style={styles.options}>{options.map(option => {
    const selected = value === option.value;
    return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${label}: ${option.label}`} accessibilityState={{ selected }} aria-checked={selected} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.option, { backgroundColor: theme.colors.surfaceRaised, borderColor: selected ? theme.colors.accent : theme.colors.border }, pressed && { opacity: 0.8 }]}>
      <LinearGradient colors={option.colors ?? [theme.colors.surfaceMuted, theme.colors.surfaceRaised]} style={styles.optionArt}>
        <Ionicons accessible={false} name={option.icon} size={27} color={option.colors ? '#FFFFFF' : theme.colors.accent} />
        {selected && <View style={[styles.selected, { backgroundColor: theme.colors.accent }]}><Ionicons accessible={false} name="checkmark" size={12} color={theme.colors.textOnAccent} /></View>}
      </LinearGradient>
      <Text style={[styles.optionLabel, { color: theme.colors.text }]}>{option.label}</Text>
    </Pressable>;
  })}</View>;
}

export function ProfileStylePreview({ profile, active = true }: { profile: OwnProfile; active?: boolean }) {
  const { locale } = useApp();
  const palette = useProfilePalette(profile);
  const copy = profileAppearanceCopy(locale);
  return <View style={[styles.preview, { backgroundColor: palette.canvas, borderColor: palette.border }]}>
    <ProfileBanner profile={profile} height={144} active={active} />
    <View pointerEvents="none" style={styles.previewBadge}><View style={styles.liveDot} /><Text style={styles.previewBadgeText}>{copy.livePreview}</Text></View>
    <View style={styles.previewIdentity}>
      <View style={styles.previewAvatar}><ProfileAvatar profile={profile} size={76} active={active} /></View>
      <View style={styles.previewCopy}>
        <Text numberOfLines={1} style={[styles.previewName, { color: palette.text }]}>{profile.displayName}, {profile.age}</Text>
        {!!profile.pronouns && <Text numberOfLines={1} style={[styles.hint, { color: palette.textMuted }]}>{profile.pronouns}</Text>}
      </View>
    </View>
    {!!profile.bio && <Text numberOfLines={2} style={[styles.previewBio, { color: palette.textMuted }]}>{profile.bio}</Text>}
    {!!profile.conversationPrompt && <View style={[styles.prompt, { backgroundColor: palette.surface, borderColor: palette.border }]}><Ionicons accessible={false} name="chatbubble-ellipses-outline" size={15} color={palette.accent} /><Text numberOfLines={2} style={[styles.promptText, { color: palette.text }]}>{profile.conversationPrompt}</Text></View>}
  </View>;
}

export function ProfileCustomization({ profile, patch, onUploadBanner, uploading = false, bannerUploaded = false, active = true }: { profile: OwnProfile; patch: <K extends keyof OwnProfile>(key: K, value: OwnProfile[K]) => void; onUploadBanner?: () => void; uploading?: boolean; bannerUploaded?: boolean; active?: boolean }) {
  const { t, theme, locale } = useApp();
  const { reducedMotion } = useAppearance();
  const copy = profileAppearanceCopy(locale);
  const [tab, setTab] = useState<Tab>('themes');
  const appearance = normalizeProfileAppearance(profile.appearance);
  const setStyle = <K extends keyof ProfileAppearance>(key: K, value: ProfileAppearance[K]) => patch('appearance', { ...appearance, [key]: value });
  const cover = profile.photos.find(photo => photo.id === profile.coverPhotoId && photo.status === 'approved');
  const tabs: Tab[] = ['themes', 'banners', 'effects', 'avatar'];
  const palettes: ProfileAppearance['palette'][] = ['default', 'fern', 'violet', 'ember', 'ocean'];
  const descriptions: Record<Tab, string> = { themes: copy.themeHint, banners: copy.bannerHint, effects: copy.effectHint, avatar: copy.avatarHint };
  return <View style={styles.studio}>
    <View style={styles.intro}><Text style={[textStyles.heading, { color: theme.colors.text }]}>{copy.title}</Text><Text style={[styles.hint, { color: theme.colors.textMuted }]}>{copy.hint}</Text></View>
    <ProfileStylePreview profile={profile} active={active} />
    <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: theme.colors.surfaceRaised }]}>{tabs.map(key => <Pressable key={key} accessibilityRole="tab" accessibilityLabel={copy[key]} accessibilityState={{ selected: tab === key }} aria-selected={tab === key} onPress={() => setTab(key)} style={[styles.tab, tab === key && { backgroundColor: theme.colors.accentSoft }]}><Text style={[styles.tabLabel, { color: tab === key ? theme.colors.accent : theme.colors.textMuted }]}>{copy[key]}</Text></Pressable>)}</View>
    <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{descriptions[tab]}</Text>
    {tab === 'themes' && <View style={styles.palettes}>{palettes.map(key => {
      const palette = key === 'default' ? theme.colors : profilePalettes[key];
      const selected = appearance.palette === key;
      return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={`${copy.themes}: ${copy[key]}`} accessibilityState={{ selected }} aria-checked={selected} onPress={() => setStyle('palette', key)} style={[styles.palette, { borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: palette.canvas }]}>
        <View style={styles.swatches}>{[palette.accent, palette.surface, palette.text].map((color, index) => <View key={index} style={[styles.swatch, { backgroundColor: color }]} />)}</View>
        <View style={styles.paletteName}><Text style={[styles.optionLabel, { color: palette.text }]}>{copy[key]}</Text>{selected && <Ionicons accessible={false} name="checkmark-circle" size={15} color={palette.accent} />}</View>
      </Pressable>;
    })}</View>}
    {tab === 'banners' && <>
      <StyleOptions label={copy.banners} value={appearance.banner} onChange={value => setStyle('banner', value)} options={[
        { value: 'photo', label: copy.photo, icon: 'image-outline' },
        { value: 'aurora', label: copy.aurora, icon: 'sparkles-outline', colors: ['#143847', '#296B50', '#6242A1'] },
        { value: 'sunset', label: copy.sunset, icon: 'sunny-outline', colors: ['#7D3057', '#D97756', '#F1B36B'] },
        { value: 'midnight', label: copy.midnight, icon: 'moon-outline', colors: ['#151D43', '#47367F', '#865DA0'] },
      ]} />
      {appearance.banner === 'photo' && <>
        <View style={styles.coverChoices}><ChoiceChip label={copy.mainPhoto} selected={!cover} onPress={() => patch('coverPhotoId', null)} />{profile.photos.filter(photo => photo.status === 'approved').map((photo, index) => <Pressable key={photo.id} accessibilityRole="radio" accessibilityState={{ selected: cover?.id === photo.id }} aria-checked={cover?.id === photo.id} accessibilityLabel={`${t('profile.cover')} ${index + 1}`} onPress={() => patch('coverPhotoId', photo.id)} style={{ borderWidth: 3, borderColor: cover?.id === photo.id ? theme.colors.accent : theme.colors.border, borderRadius: 14, overflow: 'hidden' }}><Image source={photo.posterUrl ?? photo.url} autoplay={false} style={{ width: 76, height: 62 }} contentFit="cover" /></Pressable>)}</View>
        {!!onUploadBanner && <Button variant="secondary" icon="cloud-upload-outline" label={copy.upload} loading={uploading} disabled={uploading || profile.photos.length >= 6} onPress={onUploadBanner} />}
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{profile.photos.length >= 6 ? copy.photoLimit : copy.uploadHint}</Text>
        {bannerUploaded && <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: theme.colors.accent }]}>{copy.uploaded}</Text>}
      </>}
    </>}
    {tab === 'effects' && <StyleOptions label={copy.effects} value={appearance.effect} onChange={value => setStyle('effect', value)} options={[
      { value: 'none', label: copy.none, icon: 'remove-outline' }, { value: 'fireflies', label: copy.fireflies, icon: 'leaf-outline', colors: ['#163C2B', '#477644'] },
      { value: 'sparkles', label: copy.sparkles, icon: 'sparkles-outline', colors: ['#33244D', '#765297'] }, { value: 'hearts', label: copy.hearts, icon: 'heart-outline', colors: ['#4B203D', '#AA5071'] },
    ]} />}
    {tab === 'avatar' && <StyleOptions label={copy.avatar} value={appearance.avatarBorder} onChange={value => setStyle('avatarBorder', value)} options={[
      { value: 'none', label: copy.none, icon: 'ellipse-outline' }, { value: 'glow', label: copy.glow, icon: 'sunny-outline', colors: ['#374D30', '#7C8F46'] },
      { value: 'rainbow', label: copy.rainbow, icon: 'color-palette-outline', colors: ['#C55779', '#B89057', '#5085AE'] }, { value: 'ferns', label: copy.ferns, icon: 'leaf-outline', colors: ['#163C2B', '#477644'] },
      { value: 'orbit', label: copy.orbit, icon: 'planet-outline', colors: ['#212D51', '#655392'] },
    ]} />}
    <View style={styles.motionNote}><Ionicons accessible={false} name={reducedMotion ? 'pause-circle-outline' : 'accessibility-outline'} size={16} color={theme.colors.textMuted} /><Text style={[styles.hint, styles.flex, { color: theme.colors.textMuted }]}>{copy.motionHint}</Text></View>
    <Button variant="ghost" icon="refresh-outline" label={copy.reset} onPress={() => patch('appearance', { ...defaultProfileAppearance })} />
    <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
    <Field label={t('profile.prompt')} value={profile.conversationPrompt ?? ''} onChangeText={value => patch('conversationPrompt', value.slice(0, 160))} placeholder={t('profile.promptPlaceholder')} multiline />
    <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.promptHint')} · {(profile.conversationPrompt ?? '').length}/160</Text>
  </View>;
}

export function InterestOrder({ interests, onChange }: { interests: string[]; onChange: (items: string[]) => void }) {
  const { t, theme } = useApp();
  const move = (index: number, delta: number) => { const next = [...interests]; const item = next[index]; const other = next[index + delta]; if (item === undefined || other === undefined) return; next[index] = other; next[index + delta] = item; onChange(next); };
  return <View style={{ gap: 8 }}><Text style={{ color: theme.colors.textMuted }}>{t('profile.interestOrderHint')}</Text>{interests.map((interest, index) => <View key={`${index}-${interest}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={{ flex: 1, color: theme.colors.text }}>{index + 1}. {interest}</Text>{index > 0 && <IconButton icon="arrow-up" label={t('profile.moveUp', { interest })} onPress={() => move(index, -1)} />}{index < interests.length - 1 && <IconButton icon="arrow-down" label={t('profile.moveDown', { interest })} onPress={() => move(index, 1)} />}</View>)}</View>;
}

const styles = StyleSheet.create({
  studio: { gap: 14 }, intro: { gap: 4 }, hint: { fontSize: 12, lineHeight: 18 }, flex: { flex: 1 },
  preview: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', paddingBottom: 14 },
  previewBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,.55)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#9BDEA5' }, previewBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  previewIdentity: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, alignItems: 'center', marginTop: -22 }, previewAvatar: { padding: 4 }, previewCopy: { flex: 1, paddingTop: 22, gap: 2 },
  previewName: { fontSize: 18, fontWeight: '800' }, previewBio: { paddingHorizontal: 14, fontSize: 12, lineHeight: 18, marginTop: 8 },
  prompt: { marginHorizontal: 14, marginTop: 10, borderRadius: 12, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }, promptText: { flex: 1, fontSize: 12, lineHeight: 17 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', padding: 4, borderRadius: 12, gap: 2 }, tab: { flexGrow: 1, minHeight: 44, minWidth: 53, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 7 }, tabLabel: { fontSize: 12, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { width: '46%', flexGrow: 1, borderWidth: 2, borderRadius: 13, overflow: 'hidden' }, optionArt: { height: 62, alignItems: 'center', justifyContent: 'center' }, selected: { position: 'absolute', top: 7, right: 7, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, optionLabel: { fontSize: 12, fontWeight: '700', padding: 9, flexShrink: 1 },
  palettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, palette: { width: '46%', flexGrow: 1, borderWidth: 2, borderRadius: 13, paddingTop: 12 }, swatches: { flexDirection: 'row', gap: 4, paddingHorizontal: 10 }, swatch: { width: 20, height: 20, borderRadius: 10 }, paletteName: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 9 },
  coverChoices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, motionNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' }, divider: { height: StyleSheet.hairlineWidth },
});
