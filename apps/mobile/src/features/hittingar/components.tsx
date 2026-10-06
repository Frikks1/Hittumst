import { EventCover } from './EventCover';
import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { formatMeetupReykjavikDate } from '@rummal/shared';
import { Image } from 'expo-image';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAppearance } from '@/providers/AppearanceProvider';
import { Button, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { PoolSummary } from './PoolSummary';
import { categoryKey, generalAreaLabel, participationKey, primaryHittingurAction, type HittingurListModel } from './model';

export function formatHittingurDate(value: string, locale: 'is' | 'en'): string {
  return formatMeetupReykjavikDate(value, locale);
}

export function StatusPill({ icon, label, tone = 'neutral' }: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'success';
}) {
  const { theme } = useApp();
  const color = tone === 'danger'
    ? theme.colors.danger
    : tone === 'warning'
      ? theme.colors.warning
      : tone === 'success'
        ? theme.colors.success
        : tone === 'accent'
          ? theme.colors.accent
          : theme.colors.textMuted;
  return (
    <View style={[styles.pill, { backgroundColor: theme.colors.surfaceMuted }]}>
      {icon && <Ionicons name={icon} size={14} color={color} />}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function HittingurCard({ item, onPress, primary = false, paidSponsor = false, onSponsor }: {
  item: HittingurListModel;
  onPress: () => void;
  primary?: boolean;
  paidSponsor?: boolean;
  onSponsor?: () => void;
}) {
  const { locale, t, theme } = useApp();
  const { appearance } = useAppearance();
  const participation = participationKey(item.viewerState.participationStatus);
  const area = generalAreaLabel(item, locale);
  return (
    <View style={{ gap: 6 }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${area}, ${formatHittingurDate(item.startsAt, locale)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        appearance.density === 'compact' && { padding: 12, gap: 8 },
        primary && styles.cardPrimary,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
    >
      {(primary || item.cover) && <EventCover cover={item.cover} title={item.title} compact={!primary} />}
      <View style={styles.cardTop}>
        <View style={styles.cardCopy}>
          <Text numberOfLines={2} style={[primary ? textStyles.heading : styles.cardTitle, { color: theme.colors.text }]}>{item.title}</Text>
          <Text style={[styles.date, { color: theme.colors.accent }]}>{formatHittingurDate(item.startsAt, locale)}</Text>
        </View>
        {item.host.avatarUrl ? (
          <Image source={item.host.avatarUrl} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.colors.accentSoft }]}>
            <Ionicons name="person" size={19} color={theme.colors.accent} />
          </View>
        )}
      </View>
      {item.diagnosisRestricted&&<Text style={{color:theme.colors.textMuted}}>{t('diagnosis.required')}</Text>}
      {primary ? <PoolSummary pool={item.pool} compact /> : item.pool && item.pool.total > 0 && (
        <View style={[styles.rewardRow, { backgroundColor: theme.colors.accentSoft }]}>
          <Ionicons name="gift-outline" size={16} color={theme.colors.accent} />
          <Text style={[styles.rewardText, { color: theme.colors.text }]}>{item.pool.total.toLocaleString('is-IS')} kr · {locale === 'is' ? 'Styrktarsjóður' : 'Reward pool'}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
        </View>
      )}
      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={17} color={theme.colors.textMuted} />
        <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.textMuted }]}>{area}</Text>
        {item.location.marker.isApproximate && <Text style={[styles.approximate, { color: theme.colors.textMuted }]}>{t('hittingar.location.approximate')}</Text>}
      </View>
      <View style={styles.pills}>
        <StatusPill label={t(categoryKey(item.category))} />
        {item.follows && item.follows.event.count > 0 && <StatusPill icon="heart-outline" label={`${item.follows.event.count} ${locale === 'is' ? 'fylgjendur' : 'followers'}`} />}
        <StatusPill icon={item.accessMode === 'open' ? 'lock-open-outline' : 'lock-closed-outline'} label={item.eventProfile ? t(`event.${item.eventProfile.joinMode}`) : t(`hittingar.access.${item.accessMode}`)} tone="accent" />
        {item.locationVisibility === 'protected' && <StatusPill icon="shield-checkmark-outline" label={t('hittingar.location.protected')} tone="warning" />}
        {item.isExplicit && <StatusPill label="18+" tone="danger" />}
        {participation && <StatusPill label={t(participation)} tone="success" />}
      </View>
      {item.capacity !== null && <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{Math.max(0, item.capacity - item.participantCount - (item.reservedPlaces ?? 0))} {locale === 'is' ? 'laus pláss' : 'places available'}</Text>}
      <View style={[styles.cardFooter, { borderTopColor: theme.colors.border }]}>
        <Text style={[styles.host, { color: theme.colors.textMuted }]}>{t('hittingar.hostedBy', { name: item.host.displayName })}</Text>
        <Text style={[styles.count, { color: theme.colors.text }]}>
          {item.capacity
            ? t('hittingar.capacityCount', { count: item.participantCount, capacity: item.capacity })
            : t('hittingar.participantCount', { count: item.participantCount })}
        </Text>
      </View>
    </Pressable>
    {onSponsor && item.pool?.status === 'accepting' && item.status === 'published' && <Pressable accessibilityRole="button" onPress={onSponsor} style={({ pressed }) => [styles.sponsorAction, pressed && styles.pressed]}><Ionicons name="gift-outline" size={17} color={theme.colors.accent} /><Text style={[styles.sponsorText, { color: theme.colors.accent }]}>{paidSponsor ? (locale === 'is' ? 'Styrkja hitting' : 'Sponsor meetup') : (locale === 'is' ? 'Gerast áskrifandi og styrkja' : 'Upgrade to sponsor')}</Text><Ionicons name="chevron-forward" size={15} color={theme.colors.accent} /></Pressable>}
    </View>
  );
}

export function HittingurPrimaryButton({ item, busy, onAction }: {
  item: HittingurListModel;
  busy?: boolean;
  onAction: (kind: ReturnType<typeof primaryHittingurAction>['kind']) => void;
}) {
  const { t, theme } = useApp();
  const { reducedMotion } = useAppearance();
  const action = primaryHittingurAction(item);
  const opacity = useRef(new Animated.Value(1)).current;
  const confirmed = action.kind === 'leave';
  useEffect(() => {
    if (!confirmed || reducedMotion) { opacity.setValue(1); return; }
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [confirmed, reducedMotion, opacity]);
  return (
    <View style={{ gap: 8 }}>
    {confirmed && <Animated.View accessibilityLiveRegion="polite" style={{ opacity, padding: 14, borderRadius: 16, backgroundColor: theme.colors.accentSoft, flexDirection: 'row', gap: 10, alignItems: 'center' }}><Ionicons name="checkmark-circle" size={24} color={theme.colors.success} /><View style={{ flex: 1 }}><Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>{t('hittingar.confirmedTitle')}</Text><Text style={{ color: theme.colors.textMuted }}>{t('hittingar.confirmedHint')}</Text></View></Animated.View>}
    <Button
      label={t(action.labelKey)}
      icon={action.kind === 'join' ? 'add-circle-outline' : action.kind === 'request' ? 'paper-plane-outline' : action.kind === 'manage' ? 'settings-outline' : undefined}
      variant={action.kind === 'leave' ? 'secondary' : 'primary'}
      disabled={action.disabled}
      loading={busy}
      onPress={() => onAction(action.kind)}
    />
    </View>
  );
}

export function SafetyNotice({ title, children, tone = 'warning' }: {
  title: string;
  children: ReactNode;
  tone?: 'warning' | 'danger' | 'accent';
}) {
  const { theme } = useApp();
  const color = tone === 'danger' ? theme.colors.danger : tone === 'accent' ? theme.colors.accent : theme.colors.warning;
  return (
    <View accessibilityRole="summary" style={[styles.notice, { backgroundColor: theme.colors.surface, borderColor: color }]}>
      <Ionicons name={tone === 'danger' ? 'warning-outline' : 'shield-checkmark-outline'} size={22} color={color} />
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>{title}</Text>
        <View>{children}</View>
      </View>
    </View>
  );
}

export function ViewModeToggle({ value, onChange }: { value: 'map' | 'list'; onChange: (value: 'map' | 'list') => void }) {
  const { t, theme } = useApp();
  return (
    <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: theme.colors.surfaceRaised }]}>
      {(['map', 'list'] as const).map((mode) => (
        <Pressable
          key={mode}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === mode }}
          onPress={() => onChange(mode)}
          style={[styles.segmentItem, value === mode && { backgroundColor: theme.colors.accent }]}
        >
          <Ionicons name={mode === 'map' ? 'map-outline' : 'list-outline'} size={17} color={value === mode ? theme.colors.textOnAccent : theme.colors.text} />
          <Text style={[styles.segmentText, { color: value === mode ? theme.colors.textOnAccent : theme.colors.text }]}>{t(`hittingar.view.${mode}`)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MapAttribution() {
  const { theme } = useApp();
  return (
    <View style={[styles.attribution, { backgroundColor: theme.colors.surfaceRaised }]}>
      <Text style={[styles.attributionText, { color: theme.colors.textMuted }]}>© </Text>
      <Text accessibilityRole="link" onPress={() => void Linking.openURL('https://www.maptiler.com/copyright/')} style={[styles.attributionLink, { color: theme.colors.accent }]}>MapTiler</Text>
      <Text style={[styles.attributionText, { color: theme.colors.textMuted }]}> © </Text>
      <Text accessibilityRole="link" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')} style={[styles.attributionLink, { color: theme.colors.accent }]}>OpenStreetMap</Text>
      <Text style={[styles.attributionText, { color: theme.colors.textMuted }]}> contributors</Text>
    </View>
  );
}

export function MapUnavailable({ items, onSelect, providerMissing = false }: { items: HittingurListModel[]; onSelect: (id: string) => void; providerMissing?: boolean }) {
  const { locale, t, theme } = useApp();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.mapFallback}>
      <View style={[styles.fallbackNotice, { backgroundColor: theme.colors.surfaceRaised }]}>
        <Ionicons name="map-outline" size={24} color={theme.colors.accent} />
        <View style={styles.cardCopy}>
          <Text style={[styles.fallbackTitle, { color: theme.colors.text }]}>{t('hittingar.map.fallbackTitle')}</Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{t(providerMissing ? 'hittingar.map.notConfiguredBody' : 'hittingar.map.fallbackBody')}</Text>
        </View>
      </View>
      <View style={styles.fallbackList}>
        {items.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" onPress={() => onSelect(item.id)} style={[styles.fallbackRow, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name={item.location.marker.isApproximate ? 'radio-button-on' : 'location'} size={18} color={theme.colors.accent} />
            <View style={styles.cardCopy}>
              <Text numberOfLines={1} style={[styles.fallbackTitle, { color: theme.colors.text }]}>{item.title}</Text>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{generalAreaLabel(item, locale)}</Text>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatHittingurDate(item.startsAt, locale)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

export function LocationMapUnavailable() {
  const { t, theme } = useApp();
  return <View style={[styles.fallbackNotice, { backgroundColor: theme.colors.surfaceRaised }]}>
    <Ionicons name="map-outline" size={22} color={theme.colors.textMuted} />
    <Text style={[styles.locationFallbackText, { color: theme.colors.textMuted }]}>{t('hittingar.create.pinMapUnavailable')}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  cardPrimary: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 18, elevation: 5 },
  pressed: { opacity: 0.82 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardCopy: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800' },
  date: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  avatar: { width: 42, height: 42, borderRadius: 14 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontSize: 13, lineHeight: 18 },
  approximate: { fontSize: 11, fontWeight: '800' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { minHeight: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9 },
  pillText: { fontSize: 12, lineHeight: 17, fontWeight: '800', flexShrink: 1 },
  cardFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  host: { flex: 1, fontSize: 12 },
  count: { fontSize: 12, fontWeight: '800' },
  notice: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  noticeCopy: { flex: 1, gap: 4 },
  noticeTitle: { fontSize: 15, fontWeight: '800' },
  segment: { flexDirection: 'row', borderRadius: 13, padding: 3 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segmentText: { fontSize: 13, fontWeight: '800' },
  attribution: { minHeight: 25, borderRadius: 8, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center' },
  attributionText: { fontSize: 10 },
  attributionLink: { fontSize: 10, fontWeight: '800', textDecorationLine: 'underline' },
  mapFallback: { padding: 12, gap: 10, paddingBottom: 24 },
  fallbackNotice: { borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationFallbackText: { flex: 1, fontSize: 13, lineHeight: 19 },
  rewardRow: { borderRadius: 10, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  rewardText: { flex: 1, fontSize: 13, fontWeight: '700' },
  sponsorAction: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sponsorText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  center: { textAlign: 'center' },
  fallbackList: { alignSelf: 'stretch', gap: 8, marginTop: 8 },
  fallbackRow: { minHeight: 58, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fallbackTitle: { fontSize: 14, fontWeight: '800' },
});
