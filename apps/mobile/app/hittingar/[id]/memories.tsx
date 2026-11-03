import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/ui';
import { Text } from '@/components/Typography';
import { MemoryWallFeed } from '@/features/hittingar/MemoryWall';
import { useApp } from '@/providers/AppProvider';

export default function HittingurMemoriesScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { locale, theme } = useApp();
  return <Screen back title={locale === 'is' ? 'Minningaveggur' : 'Wall of memories'}><View style={{ padding: 20, paddingBottom: 44 }}>{id ? <MemoryWallFeed id={id} /> : <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{locale === 'is' ? 'Hittingurinn fannst ekki.' : 'This hittingur could not be found.'}</Text>}</View></Screen>;
}
