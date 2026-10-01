import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { View } from 'react-native';
import type { GroupMedia as Media } from '@rummal/shared';
import { useApp } from '@/providers/AppProvider';
import { listGroupMedia } from '@/services/trains';
import { Button } from './ui';
import { Text } from './Typography';
import SharedMedia from './SharedMedia';

export default function GroupMedia({ groupId, admin }: { groupId: string; admin: boolean }) {
  const { locale, theme } = useApp(); const is = locale === 'is'; const router = useRouter();
  const [items, setItems] = useState<Media[]>([]); const [error, setError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true; setItems([]);
    const load = () => void listGroupMedia(groupId).then(rows => { if (active) { setItems(rows); setError(false); } }).catch(() => { if (active) { setItems([]); setError(true); } });
    load(); const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [groupId]));
  return <View style={{ gap: 12 }}>
    <Button variant="secondary" icon="camera-outline" label={is ? 'Myndir, myndskeið og GIF' : 'Photos, videos and GIFs'} onPress={() => router.push(`/camera-send?groupId=${groupId}` as never)} />
    {admin && <Button variant="ghost" icon="images-outline" label={is ? 'Bæta við forsíðumynd eða myndskeiði' : 'Add a group cover photo or video'} onPress={() => router.push(`/camera-send?groupId=${groupId}&cover=1` as never)} />}
    {error && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Ekki tókst að sækja miðla.' : 'Could not load media.'}</Text>}
    {[...items].sort((a, b) => Number(b.cover) - Number(a.cover)).map(item => item.url && <View key={item.id} style={{ gap: 4 }}>
      {item.cover && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Forsíða hóps' : 'Group cover'}</Text>}
      <SharedMedia uri={item.url} kind={item.kind} />
      {!!item.caption && <Text style={{ color: theme.colors.text }}>{item.caption}</Text>}
    </View>)}
  </View>;
}
