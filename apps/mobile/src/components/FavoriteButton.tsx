import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { Button } from './ui';
import { Text } from './Typography';
import { api } from '@/services';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';

export function FavoriteButton({ profileId, name }: { profileId: string; name: string }) {
  const { t, theme } = useApp(); const { reducedMotion } = useAppearance();
  const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(true); const [error, setError] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const refresh = async () => { const items = await api.listStarredItems(); const value = items.some(item => item.targetId === profileId && item.targetType === 'friend'); setSaved(value); return value; };
  useEffect(() => { let active = true; void api.listStarredItems().then(items => { if (active) setSaved(items.some(item => item.targetId === profileId && item.targetType === 'friend')); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [profileId]);
  const toggle = async () => {
    setBusy(true); setError(false);
    try { await api.toggleStarredItem('friend', profileId, name); if (await refresh() && !reducedMotion) Animated.sequence([Animated.timing(scale, { toValue: 1.12, duration: 90, useNativeDriver: true }), Animated.timing(scale, { toValue: 1, duration: 130, useNativeDriver: true })]).start(); }
    catch { setError(true); } finally { setBusy(false); }
  };
  return <View><Animated.View style={{ transform: [{ scale }] }}><Button variant="secondary" icon={saved ? 'star' : 'star-outline'} label={t(saved ? 'profile.starSaved' : 'social.star')} loading={busy} onPress={() => void toggle()} /></Animated.View>{error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('profile.starError')}</Text>}</View>;
}
