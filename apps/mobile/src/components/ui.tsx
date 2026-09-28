import { Text, TextInput } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { useAppearance } from '@/providers/AppearanceProvider';
import { useProfileTransition } from '@/providers/ProfileTransitionProvider';
import { profilePersonality } from '@/utils/discoveryPreferences';
import { interestLabel } from '@/data/interestLabels';
import { ActivityIndicator, type KeyboardTypeOptions, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/providers/AppProvider';
import type { PublicProfile } from '@/types/domain';

export function Screen({
  children,
  scroll = true,
  title,
  back,
  onBack,
  right,
}: {
  children: ReactNode;
  scroll?: boolean;
  title?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const { theme, t } = useApp();
  const router = useRouter();
  const content = (
    <View style={[styles.content, { backgroundColor: theme.colors.canvas }]}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]} edges={['top']}>
      <DemoBanner />
      {(title || back || right) && (
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.headerSide}>
            {back && (
              <IconButton
                icon="chevron-back"
                label={t('common.back')}
                onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace('/'))}
              />
            )}
          </View>
          <Text accessibilityRole={title ? "header" : undefined} style={[styles.headerTitle, { color: theme.colors.text }]}>{title}</Text>
          <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
        </View>
      )}
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  const { theme } = useApp();
  return (
    <View style={styles.brandRow} accessibilityLabel="Hittumst">
      <View style={[styles.brandMark, { backgroundColor: theme.colors.text }]}>
        <View style={[styles.bubble, { backgroundColor: theme.colors.accent }]} />
        <View style={[styles.bubbleDot, { backgroundColor: theme.colors.lava }]} />
      </View>
      {!compact && <Text style={[styles.brandText, { color: theme.colors.text }]}>Hittumst</Text>}
    </View>
  );
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const { theme } = useApp();
  const { reducedMotion } = useAppearance();
  const background =
    variant === 'primary'
      ? theme.colors.accent
      : variant === 'danger'
        ? theme.colors.danger
        : variant === 'secondary'
          ? theme.colors.surfaceRaised
          : 'transparent';
  const foreground =
    variant === 'primary'
      ? theme.colors.textOnAccent
      : variant === 'danger'
        ? '#FFFFFF'
        : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: theme.colors.border },
        pressed && [reducedMotion ? { opacity: 0.78 } : styles.pressed, variant === 'primary' && { backgroundColor: theme.colors.accentPressed }],
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color={foreground} />}
          <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={22} color={theme.colors.text} />
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  onBlur,
  maxLength,
  onSubmitEditing,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  onBlur?: () => void;
  maxLength?: number;
  onSubmitEditing?: () => void;
  editable?: boolean;
}) {
  const { theme } = useApp();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        onBlur={onBlur}
        maxLength={maxLength}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      />
    </View>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
        },
      ]}
    >
      {selected && <Ionicons name="checkmark-circle" size={16} color={theme.colors.accent} />}
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function SettingRow({
  icon,
  title,
  subtitle,
  href,
  value,
  onValueChange,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  href?: Href;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
}) {
  const { theme } = useApp();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole={href ? 'link' : onPress ? 'button' : undefined}
      onPress={href ? () => router.push(href) : onPress}
      style={[styles.setting, { borderBottomColor: theme.colors.border }]}
    >
      <View style={[styles.settingIcon, { backgroundColor: theme.colors.surfaceMuted }]}>
        <Ionicons name={icon} size={20} color={danger ? theme.colors.danger : theme.colors.accent} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, { color: danger ? theme.colors.danger : theme.colors.text }]}>{title}</Text>
        {subtitle && <Text style={[styles.caption, { color: theme.colors.textMuted }]}>{subtitle}</Text>}
      </View>
      {onValueChange ? (
        <Switch accessibilityLabel={title} accessibilityHint={subtitle} value={value} onValueChange={onValueChange} trackColor={{ true: theme.colors.accent }} />
      ) : href || onPress ? (
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

export function ProfileTile({ profile, onPress, compact = false, ownInterests = [], ownTags = [] }: { profile: PublicProfile; onPress: () => void; compact?: boolean; ownInterests?: string[]; ownTags?: string[] }) {
  const { theme, t, locale } = useApp();
  const { appearance, reducedMotion } = useAppearance();
  const transition = useProfileTransition();
  const tile = useRef<View>(null);
  const personality = profilePersonality(profile, ownInterests, ownTags);
  const detail = personality ? personality.kind === 'intent' ? t(`intent.${personality.value}`) : personality.kind === 'sharedTag' ? t('discovery.sharedInterest', { interest: interestLabel(personality.value, locale) }) : personality.kind === 'shared' ? t('discovery.sharedInterest', { interest: personality.value }) : personality.value : '';
  const open = () => {
    const uri = profile.photos[0]?.url;
    if (!uri || reducedMotion || !tile.current) { onPress(); return; }
    tile.current.measureInWindow((x, y, width, height) => { transition.start(profile.id, uri, { x, y, width, height }); onPress(); });
  };
  const source = profile.photos[0]?.url;
  return (
    <Pressable
      ref={tile}
      accessibilityRole="button"
      accessibilityLabel={`${profile.displayName}, ${profile.age}. ${profile.lookingFor.map(intent => t(`intent.${intent}`)).join(", ")}. ${profile.distanceBand ? t(`distance.${profile.distanceBand}`) : t(`region.${profile.region}`)}${detail ? `. ${detail}` : ""}${profile.isOnline ? `. ${t("common.online")}` : ""}`}
      onPress={open}
      style={({ pressed }) => [
        styles.tile,
        { aspectRatio: appearance.discoveryLayout === 'large' ? 1.1 : compact ? 0.72 : appearance.density === 'compact' ? 0.82 : 0.67 },
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pressed && (reducedMotion ? { opacity: 0.9 } : styles.tilePressed),
      ]}
    >
      {source ? (
        <Image source={source} recyclingKey={profile.id} cachePolicy="memory" style={styles.tileImage} contentFit="cover" />
      ) : (
        <LinearGradient colors={[theme.colors.accentSoft, theme.colors.surfaceMuted]} style={styles.tileImage}>
          <Ionicons name="person" size={46} color={theme.colors.textMuted} />
        </LinearGradient>
      )}
      <LinearGradient colors={['transparent', 'rgba(3,10,8,.95)']} locations={[0.45, 1]} style={[styles.tileOverlay, { padding: compact ? 8 : appearance.density === 'compact' ? 9 : 13 }]}>
        <View style={styles.nameLine}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.tileName, compact && styles.tileNameCompact]}>{profile.displayName}</Text>
          <Text numberOfLines={1} style={[styles.tileAge, compact && styles.tileNameCompact]}>{profile.age}</Text>
        </View>
        {!compact && detail ? <Text numberOfLines={1} ellipsizeMode="tail" style={styles.tileIntent}>{detail}</Text> : null}
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.tileMeta, compact && styles.tileMetaCompact]}>{profile.distanceBand ? t(`distance.${profile.distanceBand}`) : t(`region.${profile.region}`)}</Text>
      </LinearGradient>
      {profile.isOnline && <View style={styles.onlineDot} />}
    </Pressable>
  );
}

export function DemoBanner() {
  const { demo, t, theme } = useApp();
  if (!demo) return null;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={t('demo.banner')} style={[styles.demoBanner, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Ionicons name="sparkles" size={15} color={theme.colors.lava} />
      <Text style={[styles.demoText, { color: theme.colors.textMuted }]}>{t('demo.banner')}</Text>
    </View>
  );
}

export function TrustBanner({
  icon = 'shield-checkmark-outline',
  title,
  body,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
}) {
  const { theme } = useApp();
  return (
    <View style={[styles.trustBanner, { backgroundColor: theme.colors.accentSoft }]}> 
      <View style={[styles.trustIcon, { backgroundColor: theme.colors.surfaceRaised }]}> 
        <Ionicons name={icon} size={19} color={theme.colors.accent} />
      </View>
      <View style={styles.trustCopy}>
        <Text style={[styles.trustTitle, { color: theme.colors.text }]}>{title}</Text>
        {body ? <Text style={[styles.trustBody, { color: theme.colors.textMuted }]}>{body}</Text> : null}
      </View>
    </View>
  );
}

export function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  const { theme } = useApp();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
      {detail ? <Text style={[styles.sectionDetail, { color: theme.colors.textMuted }]}>{detail}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { theme } = useApp();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.accentSoft }]}>
        <Ionicons name={icon} size={30} color={theme.colors.accent} />
      </View>
      <Text style={[textStyles.heading, { color: theme.colors.text, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[textStyles.body, { color: theme.colors.textMuted, textAlign: 'center' }]}>{body}</Text> : null}
      {action}
    </View>
  );
}

export const textStyles = StyleSheet.create({
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  hero: { fontSize: 44, lineHeight: 46, fontWeight: '900', letterSpacing: -2 },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '900', letterSpacing: -1.2 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 18 },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
  scroll: { flexGrow: 1 },
  header: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  headerSide: { minWidth: 48 },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bubble: { width: 25, height: 19, borderRadius: 7 },
  bubbleDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, right: 8, bottom: 9 },
  brandText: { fontSize: 27, fontWeight: '900', letterSpacing: -1.2 },
  button: { minHeight: 54, paddingHorizontal: 20, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  buttonLabel: { fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '800' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 16, fontSize: 16 },
  multiline: { minHeight: 112, paddingTop: 14, textAlignVertical: 'top' },
  chip: { minHeight: 48, borderWidth: 1, paddingHorizontal: 13, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  setting: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  settingIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  settingCopy: { flex: 1, gap: 3 },
  settingTitle: { fontSize: 16, fontWeight: '700' },
  caption: { fontSize: 13, lineHeight: 18 },
  tile: { flex: 1, aspectRatio: 0.76, borderRadius: 22, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  tilePressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  tileImage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  tileOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', padding: 13 },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  onlineDot: { position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: '#163226', backgroundColor: '#7EF0AD' },
  tileName: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '700', flexShrink: 1, minWidth: 0 },
  tileAge: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '500', flexShrink: 0 },
  tileNameCompact: { fontSize: 13, lineHeight: 17 },
  tileIntent: { color: '#C0F3E2', fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 3 },
  tileMeta: { color: '#E6ECE8', fontSize: 12, lineHeight: 16, marginTop: 2, fontWeight: '500' },
  tileMetaCompact: { fontSize: 11, lineHeight: 14 },
  demoBanner: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  demoText: { flexShrink: 1, fontSize: 11, fontWeight: '700' },
  trustBanner: { borderRadius: 20, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  trustIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  trustCopy: { flex: 1, gap: 2 },
  trustTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  trustBody: { fontSize: 12, lineHeight: 17 },
  sectionHeader: { gap: 3 },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', letterSpacing: -0.5 },
  sectionDetail: { fontSize: 12, lineHeight: 17 },
  emptyState: { minHeight: 350, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
