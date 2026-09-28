import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import type { MeetupDetail } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, Field, Screen } from '@/components/ui';
import { api } from '@/services';
import { communityApi } from '@/services/community';
import { useApp } from '@/providers/AppProvider';

export default function CheckInScreen() {
  const { meetupId } = useLocalSearchParams<{ meetupId: string }>(); const { user } = useApp();
  return <CheckInSession key={`${meetupId}:${user?.id}`} meetupId={meetupId} />;
}
function CheckInSession({ meetupId }: { meetupId: string }) {
  const { theme, locale } = useApp(); const is = locale === 'is';
  const [event, setEvent] = useState<MeetupDetail | null>(null);
  const [code, setCode] = useState(''); const [expiresAt, setExpiresAt] = useState('');
  const [manual, setManual] = useState(''); const [scanner, setScanner] = useState(false);
  const [done, setDone] = useState(false); const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false); const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [now, setNow] = useState(Date.now()); const [retry, setRetry] = useState(0);
  const busy = useRef(false); const active = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  useFocusEffect(useCallback(() => {
    active.current = true; let live = true; setEvent(null); setError(false);
    void api.getMeetup(meetupId).then(value => { if (live) setEvent(value); }).catch(() => { if (live) setError(true); });
    const app = AppState.addEventListener('change', state => { setForeground(state === 'active'); if (state !== 'active') { setCode(''); setScanner(false); } });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { live = false; active.current = false; setCode(''); setScanner(false); app.remove(); clearInterval(timer); };
  }, [meetupId, retry]));
  const host = event?.viewerState.participationStatus === 'host';
  const allowed = event && ['joined', 'approved', 'host'].includes(event.viewerState.participationStatus);
  const windowOpen = event?.status === 'published' && Date.parse(event.startsAt) <= now && Date.parse(event.effectiveEnd) > now;
  useEffect(() => {
    if (!host || !windowOpen || !foreground) { setCode(''); return; }
    let live = true;
    const refresh = async () => {
      try {
        const response = await communityApi.createAttendanceCode(meetupId);
        if (live && active.current) { setCode(response.code); setExpiresAt(response.expiresAt); setError(false); }
      } catch { if (live) { setCode(''); setError(true); } }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 15000);
    return () => { live = false; clearInterval(timer); };
  }, [host, windowOpen, foreground, meetupId, retry]);
  const submit = async (value: string) => {
    if (busy.current || done || !active.current) return;
    busy.current = true; setSubmitting(true); setError(false);
    try { await communityApi.recordAttendance(meetupId, value.trim()); if (active.current) { setDone(true); setScanner(false); setManual(''); } }
    catch { if (active.current) setError(true); }
    finally { busy.current = false; if (active.current) setSubmitting(false); }
  };
  const scan = (data: string) => {
    try { const value: unknown = JSON.parse(data); if (!value || typeof value !== 'object' || !('meetupId' in value) || value.meetupId !== meetupId || !('code' in value) || typeof value.code !== 'string') throw new Error('wrong_event'); void submit(value.code); }
    catch { setError(true); setScanner(false); }
  };
  const freshCode = code && Date.parse(expiresAt) > now ? code : '';
  return <Screen back title={is ? 'Mæting' : 'Check-in'}><View style={{ padding: 20, gap: 16 }}>
    <Text style={{ color: theme.colors.text, lineHeight: 22 }}>{is ? 'Mæting er skráð á meðan hittingurinn stendur yfir. Skannaðu kóða gestgjafans eða sláðu hann inn, líka fyrir nethittinga.' : 'Check in during the event. Scan the host code or enter it manually, including for online gatherings.'}</Text>
    {error && <><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{is ? 'Mæting er ekki tiltæk eða kóðinn er útrunninn. Reyndu aftur með núverandi kóða.' : 'Check-in is unavailable or the code expired. Try the current code again.'}</Text><Button variant="secondary" label={is ? 'Uppfæra' : 'Refresh'} onPress={() => setRetry(value => value + 1)} /></>}
    {!event && !error && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Hleð…' : 'Loading…'}</Text>}
    {event && !allowed && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Þú þarft samþykkta þátttöku til að skrá mætingu.' : 'You need confirmed participation to check in.'}</Text>}
    {event && allowed && !windowOpen && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Innritun er opin frá upphafi til loka hittingsins.' : 'Check-in opens at the event start and closes when it ends.'}</Text>}
    {done ? <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.success, fontWeight: '800' }}>{is ? 'Mæting skráð. Þú getur gefið umsögn eftir hittinginn.' : 'Attendance recorded. You can review after the event.'}</Text> : allowed && windowOpen && (host ? <>
      {freshCode ? <><View style={{ padding: 18, backgroundColor: 'white', alignSelf: 'center' }}><QRCode size={230} value={JSON.stringify({ meetupId, code: freshCode })} /></View><Text selectable style={{ color: theme.colors.text, fontWeight: '800', fontSize: 22, textAlign: 'center' }}>{freshCode}</Text><Text style={{ color: theme.colors.textMuted }}>{is ? 'Kóðinn uppfærist sjálfkrafa. Sýndu hann aðeins fólki sem er mætt.' : 'The code refreshes automatically. Share it only with people attending.'}</Text></> : !error && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Sæki innritunarkóða…' : 'Loading check-in code…'}</Text>}
    </> : <>
      <Field label={is ? 'Innritunarkóði' : 'Check-in code'} value={manual} onChangeText={setManual} maxLength={200} />
      <Button label={is ? 'Staðfesta mætingu' : 'Confirm check-in'} loading={submitting} disabled={!manual.trim()} onPress={() => void submit(manual)} />
      {scanner && permission?.granted && foreground ? <><CameraView style={{ height: 320 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={submitting ? undefined : result => scan(result.data)} /><Button variant="secondary" label={is ? 'Loka myndavél' : 'Close camera'} onPress={() => setScanner(false)} /></> : <Button variant="secondary" icon="qr-code-outline" label={is ? 'Skanna QR-kóða' : 'Scan QR code'} onPress={() => { if (permission?.granted) setScanner(true); else void requestPermission().then(result => { if (result.granted) setScanner(true); }).catch(() => setError(true)); }} />}
    </>)}
  </View></Screen>;
}
