import { useLocalSearchParams } from 'expo-router';
import { SocialFeed } from '@/features/socialFeed/Feed';
export default function CommunityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SocialFeed communityId={id} />;
}
