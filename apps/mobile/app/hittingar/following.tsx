import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import type { MeetupSummary } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, Screen } from '@/components/ui';
import { HittingurCard } from '@/features/hittingar/components';
import { CommunityError } from '@/features/hittingar/CommunityPanels';
import { communityApi } from '@/services/community';
import { useApp } from '@/providers/AppProvider';
export default function FollowingScreen() {
  const { locale, theme, user } = useApp(); const router = useRouter();
  const [items, setItems] = useState<MeetupSummary[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true; setItems([]); setError(false); setLoading(true);
    void communityApi.listFollowing().then(rows => { if (active) setItems(rows); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, retry]));
  return <Screen back title={locale === 'is' ? 'Í eftirfylgni' : 'Following'}><View style={{ padding: 20, gap: 16 }}>
    <Text style={{ color: theme.colors.textMuted, lineHeight: 21 }}>{locale === 'is' ? 'Hittingar sem þú fylgir og hittingar frá gestgjöfum og röðum sem þú fylgir. Eftirfylgni skráir þig ekki til þátttöku.' : 'Events you follow, plus gatherings from hosts and recurring series you follow. Following does not confirm participation.'}</Text>
    {loading && <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Hleð…' : 'Loading…'}</Text>}
    {error && <><CommunityError /><Button label={locale === 'is' ? 'Reyna aftur' : 'Retry'} onPress={() => setRetry(value => value + 1)} /></>}
    {!loading && !error && !items.length && <Text style={{ color: theme.colors.text }}>{locale === 'is' ? 'Engir hittingar hér enn. Fylgdu hittingi, gestgjafa eða röð til að sjá næstu hittinga hér.' : 'Nothing here yet. Follow an event, host, or series to find their gatherings here.'}</Text>}
    {items.map(item => <HittingurCard key={item.id} item={item} onPress={() => router.push(`/hittingar/${item.id}` as Href)} />)}
  </View></Screen>;
}
