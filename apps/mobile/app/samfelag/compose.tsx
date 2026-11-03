import { useLocalSearchParams } from 'expo-router';
import { FeedCompose } from '@/features/socialFeed/Compose';
export default function ComposeRoute() {
  const { communityId } = useLocalSearchParams<{ communityId?: string }>();
  return <FeedCompose communityId={communityId} />;
}
