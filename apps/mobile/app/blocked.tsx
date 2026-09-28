import { Text } from '@/components/Typography';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { PublicProfile } from '@/types/domain';

export default function BlockedScreen() {
  const { t, theme, user } = useApp();
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  useFocusEffect(useCallback(() => {
    let active = true; revision.current++; setBusy(null); setLoading(true); setError(false); setProfiles([]);
    void api.listBlocked().then(items => { if (active) setProfiles(items); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; revision.current++; };
  }, [attempt, user?.id]));
  const unblock = async (id: string) => {
    if (busy) return; const request = revision.current; setBusy(id); setError(false);
    try { await api.unblock(id); if (request === revision.current) setAttempt(value => value + 1); }
    catch { if (request === revision.current) setError(true); } finally { if (request === revision.current) setBusy(null); }
  };
  return <Screen back title={t('blocked.title')}><View style={styles.page}>
    {error && <View><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('common.error')}</Text><Button label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} /></View>}
    {loading ? <Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text> : profiles.length === 0 && !error ? <View style={styles.empty}><Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('blocked.empty')}</Text></View> : profiles.map(profile => <View key={profile.id} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <Image source={profile.photos[0]?.url} style={styles.avatar} />
      <Text style={[styles.name, { color: theme.colors.text }]}>{profile.displayName}</Text>
      <Button variant="secondary" disabled={Boolean(busy)} loading={busy === profile.id} label={t('blocked.unblock')} onPress={() => void unblock(profile.id)} />
    </View>)}
  </View></Screen>;
}
const styles = StyleSheet.create({ page: { padding: 20, gap: 12 }, row: { minHeight: 82, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 48, height: 48, borderRadius: 16 }, name: { flex: 1, fontWeight: '800', fontSize: 16 }, empty: { minHeight: 400, justifyContent: 'center', alignItems: 'center' } });
