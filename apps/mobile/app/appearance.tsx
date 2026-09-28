import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, Screen, SectionHeader, SettingRow } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { accentColors, darkPresets, textFonts } from '@/theme/appearance';
import { ChatBackdrop, chatBubbleColors } from '@/components/ChatAppearance';

export default function AppearanceScreen() {
  const { t, theme, themeMode, setThemeMode } = useApp();
  const { appearance: p, updateAppearance: update, resetAppearance, storageError } = useAppearance();
  const colors = chatBubbleColors(theme, p);
  return <Screen back title={t('appearance.title')}><View style={styles.page}>
    <SectionHeader title={t('appearance.subtitle')} detail={t('appearance.local')} />
    {storageError && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('appearance.storageError')}</Text>}
    <View style={[styles.preview, { borderColor: theme.colors.border }]}>
      <ChatBackdrop />
      <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>{t('appearance.preview')}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '800' }}>{t('appearance.previewName')}</Text>
      <View style={[styles.bubble, { padding: p.density === 'compact' ? 12 : 20, backgroundColor: colors.sent }]}>
        <Text style={{ color: colors.sentText, fontSize: 16, lineHeight: 24 }}>{t('appearance.previewBody')}</Text>
      </View>
      <Button label={t('appearance.reset')} variant="secondary" onPress={resetAppearance} />
    </View>
    <SectionHeader title={t('appearance.theme')} />
    <View style={styles.choices}>{(['system', 'dark', 'light'] as const).map(value => <ChoiceChip key={value} label={t(`settings.${value}`)} selected={themeMode === value} onPress={() => setThemeMode(value)} />)}</View>
    <View style={styles.choices}>{darkPresets.map(value => <ChoiceChip key={value} label={t(`appearance.${value}`)} selected={theme.dark && p.darkPreset === value} onPress={() => { update({ darkPreset: value }); setThemeMode('dark'); }} />)}</View>
    <SectionHeader title={t('appearance.accent')} />
    <View style={styles.choices}>{accentColors.map(value => <ChoiceChip key={value} label={t(`appearance.${value}`)} selected={p.accent === value} onPress={() => update({ accent: value })} />)}</View>
    <SectionHeader title={t('appearance.density')} />
    <View style={styles.choices}>{(['comfortable', 'compact'] as const).map(value => <ChoiceChip key={value} label={t(`appearance.${value}`)} selected={p.density === value} onPress={() => update({ density: value })} />)}</View>
    <SectionHeader title={t('appearance.textSize')} />
    <View style={styles.choices}>{([1, 1.15, 1.3] as const).map((value, i) => <ChoiceChip key={value} label={t((['appearance.normal', 'appearance.larger', 'appearance.largest'] as const)[i]!)} selected={p.textScale === value} onPress={() => update({ textScale: value })} />)}</View>
    <SectionHeader title={t('appearance.font')} />
    <View style={styles.choices}>{textFonts.map(value => <ChoiceChip key={value} label={t(`appearance.${value}`)} selected={p.font === value} onPress={() => update({ font: value })} />)}</View>
    <SettingRow icon="accessibility-outline" title={t('appearance.motion')} subtitle={t('appearance.motionHint')} value={p.reducedMotion} onValueChange={value => update({ reducedMotion: value })} />
    <SectionHeader title={t('appearance.discovery')} />
    <View style={styles.choices}>{(['large', 'grid', 'dense'] as const).map(value => <ChoiceChip key={value} label={t(`appearance.${value}`)} selected={p.discoveryLayout === value} onPress={() => update({ discoveryLayout: value })} />)}</View>
    <SectionHeader title={t('appearance.chat')} detail={t('appearance.chatBackground')} />
    <View style={styles.choices}>{(['plain', 'soft', 'glow'] as const).map(value => <ChoiceChip key={value} label={t(`appearance.${value}`)} selected={p.chatBackground === value} onPress={() => update({ chatBackground: value })} />)}</View>
    <SectionHeader title={t('appearance.chatBubble')} />
    <View style={styles.choices}>{(['accent', 'neutral'] as const).map(value => <ChoiceChip key={value} label={t(value === 'accent' ? 'appearance.bubbleAccent' : 'appearance.neutral')} selected={p.chatBubble === value} onPress={() => update({ chatBubble: value })} />)}</View>
  </View></Screen>;
}
const styles = StyleSheet.create({ page: { padding: 20, gap: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, preview: { padding: 20, gap: 16, borderRadius: 24, borderWidth: 1, overflow: 'hidden' }, bubble: { borderRadius: 18 } });
