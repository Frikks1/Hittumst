import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import type { CommunityAttendanceHistoryItem } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, Screen } from '@/components/ui';
import { CommunityError } from '@/features/hittingar/CommunityPanels';
import { communityApi } from '@/services/community';
import { useApp } from '@/providers/AppProvider';
export default function MyFeedbackScreen() {
  const { locale, theme, user } = useApp(); const router = useRouter();
  const [items, setItems] = useState<CommunityAttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true; setItems([]); setError(false); setLoading(true);
    void communityApi.listMyAttendance().then(rows => { if (active) setItems(rows); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, retry]));
  return <Screen back title={locale === 'is' ? 'Umsagnir mínar' : 'My feedback'}><View style={{ padding: 20, gap: 16 }}>
    <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Aðeins þú sérð þennan lista. Staðfest mæting veitir áfram rétt til umsagnar þótt aðgangur að hittingnum breytist.' : 'Only you can see this list. Recorded attendance preserves your ability to review even if access to the event changes.'}</Text>
    {loading && <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Hleð…' : 'Loading…'}</Text>}
    {error && <><CommunityError /><Button label={locale === 'is' ? 'Reyna aftur' : 'Retry'} onPress={() => setRetry(value => value + 1)} /></>}
    {!loading && !error && !items.length && <Text style={{ color: theme.colors.text }}>{locale === 'is' ? 'Engin staðfest mæting eða beiðni um yfirferð enn.' : 'No recorded attendance or missed check-in requests yet.'}</Text>}
    {items.map(item => <View key={item.meetupId} style={{ gap: 8, padding: 16, borderRadius: 18, backgroundColor: theme.colors.surface }}>
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.title}</Text>
      <Text style={{ color: theme.colors.textMuted }}>{new Date(item.effectiveEnd).toLocaleDateString(locale)}</Text>
      <Button variant="secondary" label={locale === 'is' ? 'Skoða umsögn' : 'View feedback'} onPress={() => router.push(('/hittingar/' + item.meetupId + '/feedback') as Href)} />
    </View>)}
  </View></Screen>;
}
