import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Typography';
import { Button } from './ui';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { birthdayDateLabel, birthdayPickerCopy } from '@/i18n/birthdayPicker';
import { parseDateOnly } from '@/utils/age';
import { birthdayBounds, calendarWeeks, dateOnly, isBirthdayAllowed, shiftCalendarMonths, utcDate } from '@/utils/birthdayCalendar';

type FocusTarget = { focus?: () => void };
type CalendarKey = { key: string; shiftKey: boolean; preventDefault: () => void; stopPropagation: () => void };
type Mode = 'days' | 'months' | 'years';

export function BirthdayPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { theme, locale, t } = useApp();
  const { reducedMotion } = useAppearance();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const copy = birthdayPickerCopy(locale);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode>('days');
  const [today, setToday] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => birthdayBounds().max);
  const [draft, setDraft] = useState('');
  const triggerRef = useRef<FocusTarget | null>(null);
  const dayRefs = useRef(new Map<string, FocusTarget>());
  const choiceRef = useRef<FocusTarget | null>(null);
  const yearScrollRef = useRef<ScrollView>(null);
  const { min, max } = birthdayBounds(today);
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const previousDisabled = utcDate(year, month, 0) < min;
  const nextDisabled = utcDate(year, month + 1, 1) > max;
  const formatDate = (date: Date) => birthdayDateLabel(date, locale);
  const monthName = (index: number) => copy.months[index]!;
  const selected = parseDateOnly(value);
  const weeks = calendarWeeks(year, month);
  const years = Array.from({ length: max.getUTCFullYear() - min.getUTCFullYear() + 1 }, (_, index) => max.getUTCFullYear() - index);
  const clamp = (date: Date) => date < min ? min : date > max ? max : date;

  const focusCurrent = () => {
    if (Platform.OS === 'web') {
      if (mode === 'days') dayRefs.current.get(dateOnly(cursor))?.focus?.();
      else choiceRef.current?.focus?.();
    }
  };
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(focusCurrent);
    return () => cancelAnimationFrame(frame);
  // Focus follows keyboard navigation and the selected month/year choice.
  }, [visible, mode, cursor]);

  const close = () => {
    setVisible(false);
  };
  const restoreFocus = () => { if (Platform.OS === 'web') triggerRef.current?.focus?.(); };
  const open = () => {
    const now = new Date();
    const existing = isBirthdayAllowed(value, now) ? parseDateOnly(value) : null;
    setToday(now);
    setDraft(existing ? value : '');
    setCursor(existing ?? birthdayBounds(now).max);
    setMode('days');
    setVisible(true);
  };
  const changeMonth = (offset: number) => setCursor(clamp(shiftCalendarMonths(cursor, offset)));
  const moveFocus = (date: Date) => setCursor(clamp(date));
  const onCalendarKey = (event: CalendarKey, date: Date) => {
    let next: Date | undefined;
    if (event.key === 'ArrowLeft') next = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1);
    if (event.key === 'ArrowRight') next = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    if (event.key === 'ArrowUp') next = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 7);
    if (event.key === 'ArrowDown') next = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 7);
    if (event.key === 'Home') next = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    if (event.key === 'End') next = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 6 - (date.getUTCDay() + 6) % 7);
    if (event.key === 'PageUp') next = shiftCalendarMonths(date, event.shiftKey ? -12 : -1);
    if (event.key === 'PageDown') next = shiftCalendarMonths(date, event.shiftKey ? 12 : 1);
    if (next) { event.preventDefault(); event.stopPropagation(); moveFocus(next); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectDay(date); }
  };
  const selectDay = (date: Date) => {
    const next = dateOnly(date);
    if (!isBirthdayAllowed(next, today)) return;
    setDraft(next); setCursor(date);
  };
  const apply = () => {
    const now = new Date();
    setToday(now);
    if (!isBirthdayAllowed(draft, now)) { setDraft(''); setCursor(birthdayBounds(now).max); return; }
    onChange(draft);
    close();
  };
  const decorative = { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  return <View style={styles.field}>
    <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
    <Pressable ref={node => { triggerRef.current = node as unknown as FocusTarget; }} accessibilityRole="button" accessibilityLabel={selected ? `${label}: ${formatDate(selected)}` : label} accessibilityHint={copy.choose} aria-haspopup="dialog" accessibilityState={{ expanded: visible }} aria-expanded={visible} onPress={open} style={({ pressed }) => [styles.trigger, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.value, { color: selected ? theme.colors.text : theme.colors.textMuted }]}>{selected ? birthdayDateLabel(selected, locale, false) : copy.choose}</Text>
      <Ionicons {...decorative} name="calendar-outline" size={22} color={theme.colors.accent} />
    </Pressable>
    <Modal transparent visible={visible} accessibilityLabel={label} animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={close} onShow={focusCurrent} onDismiss={restoreFocus} statusBarTranslucent>
      <View style={[styles.overlay, { paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom) }]}>
        <Pressable accessible={false} importantForAccessibility="no-hide-descendants" tabIndex={-1} onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.dialog, { maxHeight: height - Math.max(12, insets.top) - Math.max(12, insets.bottom), backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} style={styles.iconButton}><Ionicons {...decorative} name="close" size={22} color={theme.colors.textMuted} /></Pressable>
          </View>
          <Text accessibilityLiveRegion="polite" style={[styles.selected, { color: draft ? theme.colors.accent : theme.colors.textMuted }]}>{draft ? birthdayDateLabel(parseDateOnly(draft)!, locale, false) : copy.choose}</Text>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {mode === 'days' ? <>
            <View style={styles.navigation}>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.previous} accessibilityState={{ disabled: previousDisabled }} disabled={previousDisabled} onPress={() => changeMonth(-1)} style={[styles.iconButton, previousDisabled && { opacity: 0.3 }]}><Ionicons {...decorative} name="chevron-back" size={20} color={theme.colors.text} /></Pressable>
              <View style={styles.period}>
                <Pressable accessibilityRole="button" accessibilityLabel={copy.chooseMonth} onPress={() => setMode('months')} style={styles.periodButton}><Text style={[styles.periodText, { color: theme.colors.text }]}>{monthName(month)}</Text><Ionicons {...decorative} name="chevron-down" size={13} color={theme.colors.textMuted} /></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={copy.chooseYear} onPress={() => setMode('years')} style={styles.periodButton}><Text style={[styles.periodText, { color: theme.colors.text }]}>{year}</Text><Ionicons {...decorative} name="chevron-down" size={13} color={theme.colors.textMuted} /></Pressable>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.next} accessibilityState={{ disabled: nextDisabled }} disabled={nextDisabled} onPress={() => changeMonth(1)} style={[styles.iconButton, nextDisabled && { opacity: 0.3 }]}><Ionicons {...decorative} name="chevron-forward" size={20} color={theme.colors.text} /></Pressable>
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.announcement}>{`${monthName(month)} ${year}`}</Text>
            <ScrollView style={styles.calendarScroll} contentContainerStyle={styles.calendarContent}>
              <View role="grid" accessibilityLabel={`${monthName(month)} ${year}`}>
                <View role="row" style={styles.week}>{Array.from({ length: 7 }, (_, index) => {
                  const date = utcDate(2024, 0, index + 1);
                  return <Text key={index} role="columnheader" accessibilityLabel={copy.weekdays[date.getUTCDay()]} style={[styles.weekday, { color: theme.colors.textMuted }]}>{copy.weekdaysShort[date.getUTCDay()]}</Text>;
                })}</View>
                {weeks.map((week, index) => <View key={index} role="row" style={styles.week}>{week.map(date => {
                  const iso = dateOnly(date);
                  const disabled = date < min || date > max;
                  const checked = draft === iso;
                  const focused = dateOnly(cursor) === iso;
                  // Native role typings omit the web ARIA gridcell role.
                  return <Pressable key={iso} ref={node => { if (node) dayRefs.current.set(iso, node as unknown as FocusTarget); else dayRefs.current.delete(iso); }} role={Platform.OS === 'web' ? ('gridcell' as 'cell') : undefined} accessibilityRole="button" accessibilityLabel={formatDate(date)} accessibilityState={{ selected: checked, disabled }} aria-selected={checked} tabIndex={focused && !disabled ? 0 : -1} disabled={disabled} onPress={() => selectDay(date)} {...(Platform.OS === 'web' ? { onKeyDown: (event: CalendarKey) => onCalendarKey(event, date) } : {})} style={({ pressed }) => [styles.day, { borderColor: focused ? theme.colors.accent : 'transparent', backgroundColor: checked ? theme.colors.accent : 'transparent' }, pressed && { backgroundColor: theme.colors.accentSoft }, disabled && { opacity: 0.3 }]}>
                    <Text style={[styles.dayText, { color: checked ? theme.colors.textOnAccent : date.getUTCMonth() !== month ? theme.colors.textMuted : theme.colors.text }]}>{date.getUTCDate()}</Text>
                  </Pressable>;
                })}</View>)}
              </View>
            </ScrollView>
          </> : <>
            <View style={styles.choiceHeading}><Text accessibilityRole="header" style={[styles.periodText, { color: theme.colors.text }]}>{mode === 'years' ? copy.chooseYear : `${copy.chooseMonth} · ${year}`}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => setMode('days')} style={styles.iconButton}><Ionicons {...decorative} name="chevron-up" size={20} color={theme.colors.textMuted} /></Pressable></View>
            <ScrollView ref={yearScrollRef} style={[styles.choiceScroll, mode === 'months' && { maxHeight: 350 }]} contentContainerStyle={styles.choiceGrid} onContentSizeChange={() => { if (mode === 'years') yearScrollRef.current?.scrollTo({ y: Math.max(0, Math.floor((max.getUTCFullYear() - year) / 3) * 56 - 56), animated: false }); }}>
              {(mode === 'years' ? years : Array.from({ length: 12 }, (_, index) => index)).map(item => {
                const active = mode === 'years' ? item === year : item === month;
                const disabled = mode === 'months' && (utcDate(year, item + 1, 0) < min || utcDate(year, item, 1) > max);
                return <Pressable key={item} ref={node => { if (active) choiceRef.current = node as unknown as FocusTarget; }} accessibilityRole="button" accessibilityLabel={mode === 'years' ? String(item) : monthName(item)} accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={() => { setCursor(clamp(mode === 'years' ? shiftCalendarMonths(cursor, (item - year) * 12) : shiftCalendarMonths(cursor, item - month))); setMode('days'); }} style={({ pressed }) => [styles.choice, mode === 'months' && styles.monthChoice, { backgroundColor: active ? theme.colors.accentSoft : theme.colors.surfaceRaised, borderColor: active ? theme.colors.accent : theme.colors.border }, disabled && { opacity: 0.3 }, pressed && { opacity: 0.8 }]}><Text style={[styles.choiceText, { color: active ? theme.colors.accent : theme.colors.text }]}>{mode === 'years' ? item : monthName(item)}</Text></Pressable>;
              })}
            </ScrollView>
          </>}
          <View style={[styles.actions, { borderTopColor: theme.colors.border }]}><View style={styles.action}><Button label={copy.cancel} variant="secondary" onPress={close} /></View><View style={styles.action}><Button label={copy.apply} disabled={!isBirthdayAllowed(draft, today)} onPress={apply} /></View></View>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{copy.hint}</Text>
          {Platform.OS === 'web' && <Text style={styles.announcement}>{copy.keyboard}</Text>}
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 8 }, label: { fontSize: 13, fontWeight: '700' },
  trigger: { minHeight: 54, borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { flex: 1, fontSize: 16 }, overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8, backgroundColor: 'rgba(0,0,0,0.72)' },
  dialog: { width: '100%', maxWidth: 390, padding: 12, borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, fontSize: 20, fontWeight: '800' },
  selected: { fontSize: 16, fontWeight: '700', marginBottom: 16 }, divider: { height: StyleSheet.hairlineWidth },
  navigation: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 }, period: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4, flexWrap: 'wrap' },
  periodButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6 }, periodText: { fontSize: 15, fontWeight: '700' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  calendarScroll: { flexGrow: 0, flexShrink: 1 }, calendarContent: { paddingBottom: 8 }, week: { flexDirection: 'row' },
  weekday: { width: '14.285714%', textAlign: 'center', fontSize: 11, fontWeight: '700', paddingVertical: 9 },
  day: { width: '14.285714%', minHeight: 44, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, dayText: { fontSize: 15, fontWeight: '600' },
  choiceHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginVertical: 4 },
  choiceScroll: { maxHeight: 290, flexGrow: 0, flexShrink: 1 }, choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  choice: { width: '31%', flexGrow: 1, minHeight: 48, padding: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, monthChoice: { width: '47%' }, choiceText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth }, action: { flex: 1 },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 10 }, announcement: { width: 1, height: 1, overflow: 'hidden', position: 'absolute', opacity: 0 },
});
