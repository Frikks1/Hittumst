import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui';
import { HostCommunity } from '@/features/hittingar/CommunityPanels';
import { useApp } from '@/providers/AppProvider';
export default function HostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { locale, user } = useApp();
  return <Screen back title={locale === 'is' ? 'Gestgjafi' : 'Host'}><View style={{ padding: 20, gap: 18 }}>{id && <HostCommunity key={`${user?.id}:${id}`} hostId={id} />}</View></Screen>;
}
