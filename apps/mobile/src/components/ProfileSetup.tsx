import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { useApp } from '@/providers/AppProvider';
import { profileSetupCopy } from '@/i18n/profileSetup';
import type { Intent } from '@/types/domain';

export const profileIntents: Intent[] = ['chat', 'dates', 'friends', 'relationship'];
const icons: Record<Intent, keyof typeof Ionicons.glyphMap> = { chat: 'chatbubbles-outline', dates: 'wine-outline', friends: 'people-outline', relationship: 'heart-outline' };

export function IntentCards({ value, onChange }: { value: Intent[]; onChange: (value: Intent[]) => void }) {
  const { t, theme, locale } = useApp();
  const copy = profileSetupCopy(locale);
  return <View style={styles.intentGrid}>{profileIntents.map(intent => {
    const selected = value.includes(intent);
    return <Pressable key={intent} accessibilityRole="checkbox" accessibilityLabel={t(`intent.${intent}`)} accessibilityHint={copy.intentDescriptions[intent]} accessibilityState={{ checked: selected }} aria-checked={selected} onPress={() => onChange(selected ? value.filter(item => item !== intent) : [...value, intent])} style={({ pressed }) => [styles.intentCard, { borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface }, pressed && { opacity: 0.8 }]}>
      <View style={styles.intentTop}><Ionicons accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name={icons[intent]} size={25} color={selected ? theme.colors.accent : theme.colors.textMuted} /><Ionicons accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={selected ? theme.colors.accent : theme.colors.border} /></View>
      <Text style={[styles.intentTitle, { color: theme.colors.text }]}>{t(`intent.${intent}`)}</Text>
      <Text style={[styles.intentHint, { color: theme.colors.textMuted }]}>{copy.intentDescriptions[intent]}</Text>
    </Pressable>;
  })}</View>;
}

export function ExpandableProfileSection({ title, summary, icon, open, onPress, children }: { title: string; summary?: string; icon: keyof typeof Ionicons.glyphMap; open: boolean; onPress: () => void; children: ReactNode }) {
  const { theme } = useApp();
  return <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={summary} accessibilityState={{ expanded: open }} aria-expanded={open} onPress={onPress} style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.8 }]}>
      <Ionicons accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name={icon} size={22} color={theme.colors.accent} />
      <View style={styles.sectionCopy}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>{summary && <Text numberOfLines={open ? undefined : 2} style={[styles.intentHint, { color: theme.colors.textMuted }]}>{summary}</Text>}</View>
      <Ionicons accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name={open ? 'chevron-up' : 'chevron-down'} size={17} color={theme.colors.textMuted} />
    </Pressable>
    {open && <View style={styles.sectionBody}>{children}</View>}
  </View>;
}

const styles = StyleSheet.create({
  intentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  intentCard: { width: '47%', flexGrow: 1, minHeight: 132, borderWidth: 1, borderRadius: 16, padding: 14, gap: 7 },
  intentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  intentTitle: { fontSize: 16, fontWeight: '800' },
  intentHint: { fontSize: 12, lineHeight: 18 },
  section: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  sectionHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 11 },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 16, gap: 14 },
});
