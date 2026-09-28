import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/ui';
import { EventReviews } from '@/features/hittingar/EventReviews';
import { useApp } from '@/providers/AppProvider';
export default function FeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { locale } = useApp();
  return <Screen back title={locale === 'is' ? 'Umsögn mín' : 'My feedback'}><View style={{ padding: 20 }}>
    <EventReviews detail={{ id }} />
  </View></Screen>;
}
