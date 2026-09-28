import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { Text } from './Typography';
import { useAppearance } from '@/providers/AppearanceProvider';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
export function PremiumProfile({ profileId }: { profileId: string }) {
  const { reducedMotion } = useAppearance();
  const { theme, locale } = useApp();
  const opacity = useRef(new Animated.Value(1)).current;
  const [benefits, setBenefits] = useState({ effect: false, badge: false, months: 0 });
  useEffect(() => {
    let mounted = true;
    void api
      .getPremiumProfile(profileId)
      .then((value) => {
        if (mounted) setBenefits(value);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [profileId]);
  useEffect(() => {
    opacity.setValue(1);
    if (!benefits.effect || reducedMotion) return;
    const animation = Animated.sequence([
      Animated.timing(opacity, { toValue: 0.35, duration: 500, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [benefits.effect, reducedMotion, opacity]);
  if (!benefits.effect && !benefits.badge) return null;
  return (
    <View style={{ gap: 8 }}>
      {benefits.effect && (
        <Animated.View
          accessible={false}
          style={{ opacity, height: 4, borderRadius: 4, backgroundColor: theme.colors.accent }}
        />
      )}
      {benefits.badge && (
        <Text style={{ color: theme.colors.accent }}>
          ♛ Plebba Kóngur · {benefits.months} {locale === 'is' ? 'mánuðir' : 'months'}
        </Text>
      )}
    </View>
  );
}
