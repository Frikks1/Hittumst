import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { Screen, Button } from '@/components/ui';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { api, runtimeEnv } from '@/services';
import { readAccountMediaManifest, saveAccountMedia, type AccountMediaItem } from '@/services/accountMedia';

export default function MediaExportScreen() {
  const { locale, theme } = useApp();
  const [items, setItems] = useState<AccountMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const is = locale === 'is';
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError(false); setItems([]); setSaved(new Set());
    void api.requestExport().then(json => { if (active) setItems(readAccountMediaManifest(json)); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; setItems([]); setSaved(new Set()); };
  }, [revision]));
  const save = async (item: AccountMediaItem) => {
    if (busy) return;
    setBusy(item.id); setError(false);
    try { await saveAccountMedia(item); setSaved(previous => new Set([...previous, item.id])); }
    catch { setError(true); }
    finally { setBusy(null); }
  };
  const types: Record<string, string> = is
    ? { 'album-media':'Albúm', 'profile-photos':'Prófílmynd', 'profile-videos':'Prófílmyndskeið', 'message-images':'Skilaboðamynd', 'meetup-media':'Viðburður' }
    : { 'album-media':'Album', 'profile-photos':'Profile photo', 'profile-videos':'Profile video', 'message-images':'Message image', 'meetup-media':'Event media' };
  return <Screen back title={is ? 'Sækja miðla' : 'Download media'}><View style={{ padding:22, gap:16 }}>
    <Text style={{ color:theme.colors.textMuted }}>{is ? 'Vistaðu eigin myndir og myndskeið með því að velja skrá hér fyrir neðan. Gögn um reikninginn eru í sérstöku JSON-afriti. Hráar upphleðslur sem bíða yfirferðar eða voru hafnaðar eru ekki innifaldar.' : 'Save your own photos and videos by choosing each file below. Account records are in the separate JSON export. Raw uploads awaiting review or rejected during review are excluded.'}</Text>
    {!runtimeEnv.websiteUrl && <Text accessibilityRole="alert" style={{ color:theme.colors.danger }}>{is ? 'Þjónusta fyrir niðurhal miðla hefur ekki verið stillt í þessari útgáfu.' : 'The media download service has not been configured for this build.'}</Text>}
    {loading && <Text accessibilityLiveRegion="polite" style={{ color:theme.colors.textMuted }}>{is ? 'Sæki skráalista…' : 'Loading your files…'}</Text>}
    {error && <Text accessibilityRole="alert" style={{ color:theme.colors.danger }}>{is ? 'Ekki tókst að sækja eða vista skrá. Reyndu aftur.' : 'The files could not be loaded or saved. Please retry.'}</Text>}
    <Button variant="secondary" loading={loading} disabled={busy !== null} label={is ? 'Endurhlaða lista' : 'Refresh files'} onPress={() => setRevision(value => value + 1)} />
    {!loading && !error && !items.length && <Text style={{ color:theme.colors.textMuted }}>{is ? 'Engar skrár tiltækar.' : 'No downloadable files.'}</Text>}
    {items.map((item, index) => <View key={item.id} style={{ padding:16, gap:10, borderRadius:16, backgroundColor:theme.colors.surface }}>
      <Text style={{ color:theme.colors.text }}>{types[item.bucket]} · {index + 1}{typeof item.bytes === 'number' ? ` · ${(item.bytes / 1024 / 1024).toFixed(1)} MB` : ''}</Text>
      <Button variant="secondary" disabled={busy !== null || !runtimeEnv.websiteUrl} loading={busy === item.id} label={saved.has(item.id) ? (is ? 'Vista aftur' : 'Save again') : (is ? 'Vista skrá' : 'Save file')} onPress={() => void save(item)} />
    </View>)}
  </View></Screen>;
}
