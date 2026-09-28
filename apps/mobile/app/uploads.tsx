import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { Screen, Button } from '@/components/ui';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { supabase } from '@/services/supabase';
type Upload = { id: string; status: string; createdAt: string; reason: string | null; targetType: string };
export default function UploadsScreen() {
  const { locale, theme } = useApp();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (api.isDemo || !supabase) return [];
    const response = await supabase.rpc('list_my_media_uploads');
    if (response.error) throw response.error;
    return response.data as Upload[];
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = () => void load().then(items => { if (active) { setUploads(items); setError(false); } }).catch(() => { if (active) setError(true); });
    refresh(); const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); setUploads([]); };
  }, [load]));
  const appeal = async (id: string) => {
    setBusy(id); setError(false);
    try { await api.appealMediaUpload(id); setUploads(await load()); } catch { setError(true); } finally { setBusy(null); }
  };
  const labels: Record<string,string> = locale === 'is'
    ? { reserved:'Bíður vinnslu', processing:'Í öryggisyfirferð', approved:'Birt', rejected:'Ekki birt', appealed:'Bíður yfirferðar starfsfólks' }
    : { reserved:'Queued', processing:'Safety review in progress', approved:'Published', rejected:'Not published', appealed:'Waiting for staff review' };
  return <Screen back title={locale === 'is' ? 'Upphleðslur og yfirferð' : 'Uploads and review'}><View style={{ padding:22, gap:16 }}>
    <Text style={{ color:theme.colors.textMuted }}>{locale === 'is' ? 'Myndir og myndskeið birtast eftir öryggisyfirferð. Hér sjást síðustu 100 upphleðslur. Þú getur óskað eftir endurskoðun ef efni var ekki birt.' : 'Photos and videos appear after safety review. Your latest 100 uploads are shown here. You can request staff review when content was not published.'}</Text>
    {error && <Text accessibilityRole="alert" style={{ color:theme.colors.danger }}>{locale === 'is' ? 'Ekki tókst að sækja upphleðslur. Reyndu aftur.' : 'Uploads could not be loaded. Please try again.'}</Text>}
    {!uploads.length && !error && <Text style={{ color:theme.colors.textMuted }}>{locale === 'is' ? 'Engar upphleðslur enn.' : 'No uploads yet.'}</Text>}
    {uploads.map(item => <View key={item.id} style={{ padding:16, gap:10, borderRadius:16, backgroundColor:theme.colors.surface }}>
      <Text accessibilityLiveRegion="polite" style={{ color:theme.colors.text }}>{labels[item.status] ?? item.status}</Text>
      <Text style={{ color:theme.colors.textMuted }}>{new Date(item.createdAt).toLocaleString(locale === 'is' ? 'is-IS' : 'en-GB')}</Text>
      {item.status === 'rejected' && item.reason !== 'upload_cancelled' && item.reason !== 'media_target_unavailable' && <Button variant="secondary" loading={busy === item.id} disabled={busy !== null} label={locale === 'is' ? 'Óska eftir endurskoðun' : 'Request staff review'} onPress={() => void appeal(item.id)} />}
    </View>)}
  </View></Screen>;
}
