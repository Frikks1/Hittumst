import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { ChoiceChip, Field, IconButton, textStyles } from './ui';
import { Text } from './Typography';
import { useApp } from '@/providers/AppProvider';
import type { OwnProfile } from '@/types/domain';

export function ProfileCustomization({ profile, patch }: { profile: OwnProfile; patch: <K extends keyof OwnProfile>(key: K, value: OwnProfile[K]) => void }) {
  const { t, theme } = useApp();
  const cover = profile.photos.find(photo => photo.id === profile.coverPhotoId && photo.status === 'approved');
  return <View style={{ gap: 12 }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('profile.cover')}</Text>
    <Text style={{ color: theme.colors.textMuted }}>{t('profile.coverHint')}</Text>
    {cover && <Image source={cover.url} contentFit="cover" style={{ width: '100%', height: 160, borderRadius: 18 }} accessibilityLabel={t('profile.cover')} />}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <ChoiceChip label={t('profile.noCover')} selected={!cover} onPress={() => patch('coverPhotoId', null)} />
      {profile.photos.filter(photo => photo.status === 'approved').map((photo, index) => <Pressable key={photo.id} accessibilityRole="radio" accessibilityState={{ selected: cover?.id === photo.id }} accessibilityLabel={`${t('profile.cover')} ${index + 1}`} onPress={() => patch('coverPhotoId', photo.id)} style={{ borderWidth: 3, borderColor: cover?.id === photo.id ? theme.colors.accent : theme.colors.border, borderRadius: 14, overflow: 'hidden' }}><Image source={photo.url} style={{ width: 76, height: 62 }} contentFit="cover" /></Pressable>)}
    </View>
    <Field label={t('profile.prompt')} value={profile.conversationPrompt ?? ''} onChangeText={value => patch('conversationPrompt', value.slice(0, 160))} placeholder={t('profile.promptPlaceholder')} multiline />
    <Text style={{ color: theme.colors.textMuted }}>{t('profile.promptHint')} · {(profile.conversationPrompt ?? '').length}/160</Text>
  </View>;
}

export function InterestOrder({ interests, onChange }: { interests: string[]; onChange: (items: string[]) => void }) {
  const { t, theme } = useApp();
  const move = (index: number, delta: number) => { const next = [...interests]; const item = next[index]; const other = next[index + delta]; if (item === undefined || other === undefined) return; next[index] = other; next[index + delta] = item; onChange(next); };
  return <View style={{ gap: 8 }}><Text style={{ color: theme.colors.textMuted }}>{t('profile.interestOrderHint')}</Text>{interests.map((interest, index) => <View key={`${index}-${interest}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={{ flex: 1, color: theme.colors.text }}>{index + 1}. {interest}</Text>{index > 0 && <IconButton icon="arrow-up" label={t('profile.moveUp', { interest })} onPress={() => move(index, -1)} />}{index < interests.length - 1 && <IconButton icon="arrow-down" label={t('profile.moveDown', { interest })} onPress={() => move(index, 1)} />}</View>)}</View>;
}
