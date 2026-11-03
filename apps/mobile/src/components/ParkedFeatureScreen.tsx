import { useRouter } from 'expo-router';
import { Button, EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';

export function ParkedFeatureScreen() {
  const { locale } = useApp();
  const router = useRouter();
  return <Screen back><EmptyState icon="archive-outline"
    title={locale === 'is' ? 'Þessi eiginleiki er ekki í boði' : 'This feature is unavailable'}
    body={locale === 'is' ? 'Gögnin þín eru varðveitt.' : 'Your existing records are preserved.'}
    action={<Button label={locale === 'is' ? 'Til baka í Hittumst' : 'Back to Hittumst'} onPress={() => router.replace('/(tabs)/discover')} />} />
  </Screen>;
}
