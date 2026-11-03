import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { MeetupDetail } from '@/types/domain';
import { createMeetupCalendar, meetupDirectionsUrl } from '@/utils/meetupCalendar';
import { saveExportFile } from '@/utils/accountExport';
import { meetupReminderChoices, type MeetupReminderMinutes, type MeetupReminderState } from './eventReminderState';
import { meetupRemindersSupported, reconcileMeetupReminder, setMeetupReminder } from './eventReminders';

export function EventPlanning({ detail }: { detail: MeetupDetail }) {
  const { user, locale, theme } = useApp();
  const [reminder, setReminder] = useState<MeetupReminderState>({ minutes: null, status: 'none' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const acting = useRef(false);
  const revision = useRef(0);
  const is = locale === 'is';
  const admitted = detail.status === 'published' && ['host', 'joined', 'approved'].includes(detail.viewerState.participationStatus);
  useEffect(() => {
    ++revision.current;
    active.current = true;
    let current = true;
    if (user && meetupRemindersSupported) void reconcileMeetupReminder(api, user.id, detail, locale)
      .then(value => { if (current) setReminder(value); }).catch(() => { if (current) setError('reminder'); });
    return () => { current = false; active.current = false; ++revision.current; };
  }, [detail, user?.id, locale]);

  const run = async (operation: (fresh: MeetupDetail) => Promise<void>) => {
    if (acting.current || !active.current) return;
    const request = revision.current;
    acting.current = true; setBusy(true); setError(null);
    try {
      const fresh = await api.getMeetup(detail.id);
      if (active.current && request === revision.current) await operation(fresh);
    } catch (failure) { if (active.current && request === revision.current) setError(failure instanceof Error ? failure.message : 'failed'); }
    finally { acting.current = false; if (active.current) setBusy(false); }
  };
  const changeReminder = (minutes: MeetupReminderMinutes | null) => run(async fresh => {
    if (!user) return;
    const next = await setMeetupReminder(api, user.id, fresh, minutes, locale);
    if (active.current) setReminder(next);
  });
  if (detail.status !== 'published') return null;
  const directions = meetupDirectionsUrl(detail);
  const reminderCopy: Record<MeetupReminderState['status'], string> = {
    none: is ? 'Veldu áminningu á þessu tæki.' : 'Choose a reminder on this device.',
    scheduled: is ? 'Áminning er tímasett á þessu tæki.' : 'Reminder scheduled on this device.',
    quiet: is ? 'Áminningin fellur innan kyrrðartíma og verður ekki send.' : 'This reminder falls within quiet hours and will not be sent.',
    disabled: is ? 'Viðburðatilkynningar eru óvirkar í stillingum.' : 'Event notifications are turned off in Settings.',
    past: is ? 'Þessi áminningartími er liðinn. Veldu síðari tíma.' : 'This reminder time has passed. Choose a later reminder.',
    unsupported: is ? 'Áminningar eru í boði í uppsettu símaappi.' : 'Reminders are available in the installed mobile app.',
    unavailable: is ? 'Ekki tókst að endurnýja áminninguna. Opnaðu hittinginn aftur til að reyna.' : 'The reminder could not be refreshed. Reopen the gathering to retry.',
  };
  return <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
    <Button icon="calendar-outline" variant="secondary" disabled={busy} label={is ? 'Bæta við dagatal' : 'Add to calendar'} onPress={() => void run(async fresh => {
      await saveExportFile(createMeetupCalendar(fresh), `hittumst-${fresh.id}.ics`, 'text/calendar');
    })} />
    {detail.locationVisibility === 'protected' && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Dagatal sýnir aðeins almennt svæði. Nákvæm staðsetning er áfram í appinu.' : 'The calendar includes the general area. Exact venue details stay in the app.'}</Text>}
    {directions && <Button icon="navigate-outline" variant="secondary" disabled={busy} label={is ? 'Leiðbeiningar á staðinn' : 'Get directions'} onPress={() => void run(async fresh => {
      const destination = meetupDirectionsUrl(fresh);
      if (!destination) throw new Error('location_unavailable');
      await Linking.openURL(destination);
    })} />}
    {admitted && <>
      <Text accessibilityRole="header" style={{ fontWeight: '800', color: theme.colors.text }}>{is ? 'Áminning' : 'Reminder'}</Text>
      {meetupRemindersSupported && <View style={styles.choices}>
        {meetupReminderChoices.map(minutes => <Button key={minutes} variant={reminder.minutes === minutes ? 'primary' : 'secondary'} disabled={busy} label={minutes === 1440 ? (is ? '24 klst. áður' : '24 hours before') : minutes === 60 ? (is ? '1 klst. áður' : '1 hour before') : (is ? '15 mín. áður' : '15 minutes before')} onPress={() => void changeReminder(minutes)} />)}
        <Button variant={reminder.minutes === null ? 'primary' : 'ghost'} disabled={busy} label={is ? 'Engin' : 'None'} onPress={() => void changeReminder(null)} />
      </View>}
      <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>{reminderCopy[meetupRemindersSupported ? reminder.status : 'unsupported']}</Text>
    </>}
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error === 'reminder_permission_required' ? (is ? 'Leyfðu tilkynningar í stillingum tækisins til að fá áminningu.' : 'Allow notifications in your device settings to receive reminders.') : (is ? 'Ekki tókst að ljúka aðgerðinni. Reyndu aftur.' : 'This action could not be completed. Try again.')}</Text>}
  </View>;
}
const styles = StyleSheet.create({ card: { gap: 12, borderWidth: 1, borderRadius: 18, padding: 14 }, choices: { gap: 8 } });
