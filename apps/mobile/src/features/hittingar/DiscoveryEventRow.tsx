import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { formatHittingurDate } from './components';
import { generalAreaLabel, meetupFeeLabel, participationKey, type HittingurListModel } from './model';

export function DiscoveryEventRow({ item, selected = false, onPress }: {
  item: HittingurListModel;
  selected?: boolean;
  onPress: () => void;
}) {
  const { locale, t, theme } = useApp();
  const mint = theme.dark ? '#97E3CF' : '#17654F';
  const cover = item.cover?.kind === 'video' ? item.cover.posterUrl : item.cover?.url;
  const participation = participationKey(item.viewerState.participationStatus);
  const area = item.venueMode === 'online' ? t('hittingar.venue.online') : generalAreaLabel(item, locale);

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: selected ? theme.colors.accent : theme.colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item.title}, ${formatHittingurDate(item.startsAt, locale)}, ${area}`}
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        {cover ? <Image source={cover} accessibilityLabel={item.title} style={styles.thumbnail} contentFit="cover" /> : (
          <View style={[styles.thumbnail, styles.coverFallback, { backgroundColor: theme.colors.surfaceRaised }]}>
            <Ionicons name={item.category === 'coffee_food' ? 'cafe-outline' : item.category === 'walk_outdoors' ? 'trail-sign-outline' : 'people-outline'} size={28} color={mint} />
          </View>
        )}
        <View style={styles.copy}>
          <View style={styles.topline}>
            <Text numberOfLines={1} style={[styles.date, { color: theme.colors.accent }]}>{formatHittingurDate(item.startsAt, locale)}</Text>
            <View style={[styles.access, { backgroundColor: theme.colors.accentSoft }]}>
              <Text numberOfLines={1} style={[styles.accessText, { color: theme.colors.accent }]}>{item.isExplicit ? '18+' : t(`hittingar.access.${item.accessMode}`)}</Text>
            </View>
          </View>
          <Text numberOfLines={2} style={[styles.title, { color: theme.colors.text }]}>{item.title}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.textMuted }]}>{area}</Text>
          <Text style={[styles.count, { color: theme.colors.textMuted }]}>{item.capacity ? t('hittingar.capacityCount', { count: item.participantCount, capacity: item.capacity }) : t('hittingar.participantCount', { count: item.participantCount })} · {meetupFeeLabel(item, locale)}</Text>
          {participation && <Text style={[styles.participation, { color: mint }]}>{t(participation)}</Text>}
          {item.diagnosisRestricted && <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{t('diagnosis.required')}</Text>}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 7 },
  main: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pressed: { opacity: 0.8 },
  thumbnail: { width: 88, height: 88, borderRadius: 6 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  topline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  date: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  access: { maxWidth: '100%', borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  accessText: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  meta: { fontSize: 12, lineHeight: 17 },
  count: { fontSize: 12, lineHeight: 17 },
  participation: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
});
