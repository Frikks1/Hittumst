import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { Button, ChoiceChip, Field, SettingRow } from './ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { notificationPreferenceUpdateSchema, type NotificationPreferences } from '@/services/notificationPreferences';
import { reconcileMeetupReminders } from '@/features/hittingar/eventReminders';

export function NotificationSettings() {
  const { user, locale, theme } = useApp();
  const is = locale === 'is';
  const [state, setState] = useState<{ account: string; saved: NotificationPreferences; draft: NotificationPreferences } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'load' | 'save' | 'invalid' | null>(null);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const account = useRef(user?.id);
  account.current = user?.id;
  useFocusEffect(useCallback(() => {
    const current = ++generation.current;
    const id = user?.id;
    setError(null); setNotice(''); setLoading(Boolean(id));
    if (id) void api.getNotificationPreferences().then(value => {
      if (current === generation.current && account.current === id) setState({ account: id, saved: value, draft: value });
    }).catch(() => { if (current === generation.current) setError('load'); })
      .finally(() => { if (current === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [user?.id, attempt]));
  const value = state && state.account === user?.id ? state.draft : null;
  const update = (patch: Partial<NotificationPreferences>) => {
    if (busy.current) return;
    setNotice('');
    setState(previous => previous && previous.account === account.current ? { ...previous, draft: { ...previous.draft, ...patch } } : previous);
  };
  const save = async () => {
    if (!value || !user || busy.current) return;
    const { mutedConversationIds: _muted, ...preferences } = value;
    if (!notificationPreferenceUpdateSchema.safeParse(preferences).success) {
      setError('invalid'); return;
    }
    const id = user.id, current = generation.current;
    busy.current = true; setSaving(true); setError(null); setNotice('');
    try {
      const saved = await api.updateNotificationPreferences(preferences);
      if (id !== account.current || current !== generation.current) return;
      setState({ account: id, saved, draft: saved });
      try {
        await reconcileMeetupReminders(api, saved);
        if (id === account.current && current === generation.current) setNotice(is ? 'Stillingar tilkynninga vistaðar.' : 'Notification preferences saved.');
      } catch {
        if (id === account.current && current === generation.current) setNotice(is ? 'Stillingar vistaðar. Ekki tókst að uppfæra áminningar í símanum; opnaðu hittinginn til að reyna aftur.' : 'Preferences saved. Phone reminders could not be updated; open the meetup to retry.');
      }
    } catch { if (id === account.current && current === generation.current) setError('save'); }
    finally { busy.current = false; setSaving(false); }
  };
  const changed = state && value && JSON.stringify(value) !== JSON.stringify(state.saved);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{is ? 'Veldu tilkynningar' : 'Choose your notifications'}</Text>
    <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{is ? 'Þessar stillingar stjórna tilkynningum í símanum. Skilaboð og uppfærslur haldast í appinu.' : 'These settings control phone notifications. Messages and updates remain in the app.'}</Text>
    {loading && <ActivityIndicator accessibilityLabel={is ? 'Sæki stillingar' : 'Loading preferences'} color={theme.colors.accent} />}
    {error && <View accessibilityRole="alert" style={styles.section}><Text style={{ color: theme.colors.danger }}>{error === 'invalid'
      ? (is ? 'Notaðu tíma á forminu 22:00.' : 'Enter times in the format 22:00.')
      : error === 'load' ? (is ? 'Ekki tókst að sækja stillingar.' : 'Could not load preferences.')
        : (is ? 'Ekki tókst að vista stillingar. Reyndu aftur.' : 'Could not save preferences. Try again.')}</Text>{error === 'load' && <Button variant="secondary" label={is ? 'Reyna aftur' : 'Retry'} onPress={() => setAttempt(previous => previous + 1)} />}</View>}
    {value && <>
      <SettingRow icon="chatbubble-outline" title={is ? 'Einkaskilaboð' : 'Direct messages'} value={value.messages} onValueChange={messages => update({ messages })} />
      <SettingRow icon="flame-outline" title={is ? 'Pikk' : 'Taps'} value={value.taps} onValueChange={taps => update({ taps })} />
      <SettingRow icon="people-outline" title={is ? 'Hópskilaboð' : 'Group messages'} value={value.groups} onValueChange={groups => update({ groups })} />
      <SettingRow icon="calendar-outline" title={is ? 'Hittingar og áminningar' : 'Meetups and reminders'} value={value.events} onValueChange={events => update({ events })} />
      <SettingRow icon="moon-outline" title={is ? 'Kyrrðartími' : 'Quiet hours'} subtitle={is ? 'Engar tilkynningar á þessum tíma.' : 'No notifications during this time.'} value={value.quietHoursEnabled} onValueChange={quietHoursEnabled => update({ quietHoursEnabled })} />
      {value.quietHoursEnabled && <>
        <View style={styles.times}><View style={styles.time}><Field label={is ? 'Frá (24 klst.)' : 'From (24-hour)'} value={value.quietHoursStart} onChangeText={quietHoursStart => update({ quietHoursStart })} placeholder="22:00" maxLength={5} editable={!saving} /></View><View style={styles.time}><Field label={is ? 'Til (24 klst.)' : 'Until (24-hour)'} value={value.quietHoursEnd} onChangeText={quietHoursEnd => update({ quietHoursEnd })} placeholder="08:00" maxLength={5} editable={!saving} /></View></View>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{is ? 'Tímabelti' : 'Time zone'}: {value.timeZone}{value.quietHoursStart === value.quietHoursEnd ? (is ? ' · Allan daginn' : ' · All day') : ''}</Text>
        <View style={styles.zones}>
          <ChoiceChip label={is ? 'Ísland' : 'Iceland'} selected={value.timeZone === 'Atlantic/Reykjavik'} onPress={() => update({ timeZone: 'Atlantic/Reykjavik' })} />
          {deviceZone && deviceZone !== 'Atlantic/Reykjavik' && <ChoiceChip label={is ? 'Tímabelti tækis' : 'Device time zone'} selected={value.timeZone === deviceZone} onPress={() => update({ timeZone: deviceZone })} />}
        </View>
      </>}
      <Button variant="secondary" loading={saving} disabled={!changed || loading} label={is ? 'Vista tilkynningar' : 'Save notifications'} onPress={() => void save()} />
    </>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: theme.colors.text }]}>{notice}</Text>}
  </View>;
}
const styles = StyleSheet.create({ section: { gap: 10 }, title: { fontSize: 17, fontWeight: '700' }, hint: { fontSize: 13, lineHeight: 20 }, times: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, time: { flex: 1, minWidth: 120 }, zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
