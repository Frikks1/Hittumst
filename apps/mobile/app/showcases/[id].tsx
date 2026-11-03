import { useLocalSearchParams } from 'expo-router';
import { ShowcaseDetail } from '@/features/showcases/Detail';

export default function ShowcaseRoute() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  return <ShowcaseDetail id={id} initialEditing={edit === '1'} />;
}
