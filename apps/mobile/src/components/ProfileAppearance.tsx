import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Platform, StyleSheet, View } from 'react-native';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import type { ProfileAppearance, PublicProfile } from '@/types/domain';
import { normalizeProfileAppearance, profilePalettes } from '@/utils/profileAppearance';
import { selectMainProfilePhoto } from '@/utils/mainProfilePhoto';

type ProfileVisualSource = Pick<PublicProfile, 'photos' | 'coverPhotoId' | 'appearance' | 'displayName'>;
type ProfilePhoto = PublicProfile['photos'][number];

export function useProfilePalette(profile?: Pick<PublicProfile, 'appearance'> | null) {
  const { theme } = useApp();
  const palette = normalizeProfileAppearance(profile?.appearance).palette;
  return useMemo(() => {
    if (palette === 'default') return theme.colors;
    const colors = profilePalettes[palette];
    return { ...theme.colors, ...colors, surfaceRaised: colors.surface, surfaceMuted: colors.canvas,
      accentSoft: `${colors.accent}20`, textOnAccent: colors.canvas };
  }, [palette, theme.colors]);
}

// Stop decorative motion when another screen is focused or the app is in the background.
function useProfileMotion(active: boolean) {
  const { reducedMotion } = useAppearance();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  return active && focused && foreground && !reducedMotion;
}

function useAmbientMotion(enabled: boolean, duration = 4800) {
  const progress = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    progress.setValue(0.5);
    if (!enabled) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration, isInteraction: false, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(progress, { toValue: 0, duration, isInteraction: false, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [duration, enabled, progress]);
  return progress;
}

function isAnimatedPhoto(photo: ProfilePhoto) {
  return !!photo.posterUrl || /\.(gif|apng)(?:[?#]|$)/i.test(photo.url);
}

function ProfilePhotoImage({ photo, animated, label, rounded = false }: {
  photo: ProfilePhoto; animated: boolean; label: string; rounded?: boolean;
}) {
  const image = useRef<Image>(null);
  const animatedPhoto = isAnimatedPhoto(photo);
  const uri = !animated && animatedPhoto && photo.posterUrl ? photo.posterUrl : photo.url;
  // Browser <img> elements cannot pause GIFs. Approved GIFs use their stored still frame.
  const canDisplay = Platform.OS !== 'web' || animated || !animatedPhoto || !!photo.posterUrl;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (animated) void image.current?.startAnimating().catch(() => undefined);
    else void image.current?.stopAnimating().catch(() => undefined);
  }, [animated, uri]);
  if (!canDisplay) return null;
  return <Image ref={image} source={uri} accessibilityLabel={label} contentFit="cover"
    autoplay={animated} transition={0} recyclingKey={uri}
    onLoad={() => { if (!animated && Platform.OS !== 'web') void image.current?.stopAnimating().catch(() => undefined); }}
    style={[StyleSheet.absoluteFill, rounded && { borderRadius: 999 }]} />;
}

const particles = [
  { left: '10%', top: '22%', size: 5, phase: 1 },
  { left: '26%', top: '64%', size: 3, phase: -1 },
  { left: '45%', top: '18%', size: 4, phase: -1 },
  { left: '62%', top: '56%', size: 5, phase: 1 },
  { left: '80%', top: '24%', size: 3, phase: -1 },
  { left: '92%', top: '72%', size: 4, phase: 1 },
] as const;

export function ProfileEffects({ effect, accent, active = true }: {
  effect: ProfileAppearance['effect']; accent: string; active?: boolean;
}) {
  const animated = useProfileMotion(active);
  const progress = useAmbientMotion(animated && effect !== 'none', 3200);
  if (effect === 'none') return null;
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.effectLayer}>
    {particles.map((particle, index) => <Animated.View key={index} style={{ position: 'absolute', left: particle.left,
      top: particle.top, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: index % 2 ? [0.4, 0.9] : [0.9, 0.4] }),
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-6 * particle.phase, 6 * particle.phase] }) }] }}>
      {effect === 'fireflies' ? <View style={{ width: particle.size, height: particle.size, borderRadius: particle.size,
        backgroundColor: '#D8F5B3', shadowColor: '#D8F5B3', shadowOpacity: 0.8, shadowRadius: 6, elevation: 1 }} />
        : <Ionicons name={effect === 'hearts' ? 'heart' : 'sparkles'} size={effect === 'hearts' ? 13 : 12}
          color={effect === 'hearts' ? '#F6ACBF' : accent} />}
    </Animated.View>)}
  </View>;
}

const bannerColors: Record<Exclude<ProfileAppearance['banner'], 'photo'>, readonly [string, string, string]> = {
  aurora: ['#073A35', '#386782', '#9CDDA6'],
  sunset: ['#53204D', '#BA576A', '#F4B47B'],
  midnight: ['#0B183A', '#352E69', '#706CAA'],
};

export function ProfileBanner({ profile, height = 180, active = true }: {
  profile: ProfileVisualSource; height?: number; active?: boolean;
}) {
  const { locale } = useApp();
  const appearance = normalizeProfileAppearance(profile.appearance);
  const colors = useProfilePalette(profile);
  const animated = useProfileMotion(active);
  const progress = useAmbientMotion(animated && appearance.banner !== 'photo', 6500);
  const cover = selectMainProfilePhoto(profile);
  const artwork = appearance.banner === 'photo' ? 'aurora' : appearance.banner;
  return <View style={[styles.banner, { height, backgroundColor: colors.surfaceMuted }]}>
    <LinearGradient colors={bannerColors[artwork]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    {appearance.banner === 'photo' && cover ? <ProfilePhotoImage photo={cover} animated={animated}
      label={locale === 'is' ? `Forsíðumynd ${profile.displayName}` : `${profile.displayName}'s profile banner`} /> : <>
      <Animated.View pointerEvents="none" style={[styles.artworkGlow, { backgroundColor: appearance.banner === 'sunset' ? '#FFD19B' : '#C0F1DF',
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.27] }),
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-25, 25] }) }, { rotate: '-22deg' }] }]} />
      <View pointerEvents="none" style={[styles.artworkMoon, { backgroundColor: appearance.banner === 'sunset' ? '#FAD8B2' : '#DAD8FE',
        opacity: appearance.banner === 'midnight' ? 0.7 : 0.35 }]} />
      <View pointerEvents="none" style={styles.artworkHorizon} />
    </>}
    <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.12)']} style={StyleSheet.absoluteFill} />
    <ProfileEffects effect={appearance.effect} accent={colors.accent} active={active} />
  </View>;
}

function FernFrond({ size, side, progress }: { size: number; side: -1 | 1; progress: Animated.Value }) {
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size * 0.25, height: size * 0.64,
    left: side === -1 ? -size * 0.045 : undefined, right: side === 1 ? -size * 0.045 : undefined,
    bottom: size * 0.1, transform: [{ rotate: progress.interpolate({ inputRange: [0, 1],
      outputRange: side === -1 ? ['-19deg', '-8deg'] : ['8deg', '19deg'] }) }] }}>
    <View style={{ position: 'absolute', top: 1, bottom: 0, width: 2, left: '48%', borderRadius: 2, backgroundColor: '#A2D686' }} />
    {[0, 1, 2, 3, 4].map(index => <View key={index} style={{ position: 'absolute', top: index * size * 0.104 + 2,
      left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' }}>
      <View style={[styles.fernLeaf, { width: size * (0.06 + index * 0.012), height: size * 0.045,
        backgroundColor: index % 2 ? '#86BA73' : '#B5DE8B', transform: [{ rotate: '28deg' }] }]} />
      <View style={[styles.fernLeaf, { width: size * (0.06 + index * 0.012), height: size * 0.045,
        backgroundColor: index % 2 ? '#A2D686' : '#75AD62', transform: [{ rotate: '-28deg' }] }]} />
    </View>)}
  </Animated.View>;
}

export function ProfileAvatar({ profile, size = 96, active = true }: {
  profile: ProfileVisualSource; size?: number; active?: boolean;
}) {
  const { locale } = useApp();
  const appearance = normalizeProfileAppearance(profile.appearance);
  const colors = useProfilePalette(profile);
  const animated = useProfileMotion(active);
  const progress = useAmbientMotion(animated && ['ferns', 'glow', 'orbit'].includes(appearance.avatarBorder), 3000);
  const photo = selectMainProfilePhoto(profile);
  const ringSize = size + 10;
  return <View style={{ width: ringSize, height: ringSize }}>
    {appearance.avatarBorder === 'glow' && <Animated.View pointerEvents="none" accessible={false}
      style={[StyleSheet.absoluteFill, { borderRadius: ringSize / 2, backgroundColor: colors.accent,
        shadowColor: colors.accent, shadowOpacity: 0.8, shadowRadius: 14,
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.36] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.1] }) }] }]} />}
    <View style={{ width: ringSize, height: ringSize, borderRadius: ringSize / 2,
      backgroundColor: appearance.avatarBorder === 'none' ? colors.surface : colors.accent,
      padding: 3, borderWidth: 2, borderColor: colors.surface }}>
      {appearance.avatarBorder === 'rainbow' && <LinearGradient pointerEvents="none"
        colors={['#F59DAA', '#FFD18D', '#9EDCAA', '#91C8F1', '#C5AAE8', '#F59DAA']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: ringSize / 2 }]} />}
      <View style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name="person" size={size * 0.43} color={colors.textMuted} />
        {photo && <ProfilePhotoImage photo={photo} animated={false} rounded
          label={locale === 'is' ? `Prófílmynd ${profile.displayName}` : `${profile.displayName}'s profile photo`} />}
      </View>
    </View>
    {appearance.avatarBorder === 'ferns' && <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <FernFrond size={ringSize} side={-1} progress={progress} /><FernFrond size={ringSize} side={1} progress={progress} />
    </View>}
    {appearance.avatarBorder === 'orbit' && <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '24deg'] }) }] }]}>
      {[0, 1, 2].map(index => <View key={index} style={{ position: 'absolute', width: 9, height: 9, borderRadius: 5,
        backgroundColor: index === 1 ? '#F4C886' : colors.accent, borderWidth: 2, borderColor: colors.surface,
        left: index === 0 ? ringSize * 0.14 : index === 1 ? ringSize * 0.78 : ringSize * 0.62,
        top: index === 0 ? ringSize * 0.12 : index === 1 ? ringSize * 0.22 : ringSize * 0.88 }} />)}
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  banner: { width: '100%', overflow: 'hidden' },
  effectLayer: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  artworkGlow: { position: 'absolute', width: '115%', height: '60%', top: '13%', left: '-10%', borderRadius: 999 },
  artworkMoon: { position: 'absolute', width: 66, height: 66, borderRadius: 33, top: '17%', right: '13%' },
  artworkHorizon: { position: 'absolute', left: '-12%', right: '-12%', height: '38%', bottom: '-20%',
    backgroundColor: 'rgba(7,18,29,0.22)', borderRadius: 999, transform: [{ rotate: '-6deg' }] },
  avatarImage: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fernLeaf: { borderTopLeftRadius: 12, borderBottomRightRadius: 12, borderBottomLeftRadius: 2, borderTopRightRadius: 2 },
});
