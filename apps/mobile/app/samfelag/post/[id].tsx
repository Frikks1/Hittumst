import { useLocalSearchParams } from 'expo-router';
import { FeedPost } from '@/features/socialFeed/Post';
export default function PostRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FeedPost id={id} />;
}
