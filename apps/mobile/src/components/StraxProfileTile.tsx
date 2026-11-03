import { useEffect, useState, type ComponentProps } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/Typography';
import { ProfileTile } from '@/components/ui';
import { hittingarFeature } from '@/features/hittingar/config';
import { StraxLogo } from '@/features/strax/components';
import { useApp } from '@/providers/AppProvider';
import type { ActiveStraxBadge } from '@/types/domain';
import { straxBadgeRemaining, straxBubbleTitle } from '@/utils/straxBadge';

function useActiveBadge(badge?: ActiveStraxBadge | null): boolean {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!badge || straxBadgeRemaining(badge) <= 0) return;
    const refresh = () => setRevision(value => value + 1);
    const timer = setTimeout(refresh, Math.min(straxBadgeRemaining(badge) + 1, 2_147_483_647));
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [badge, revision]);
  return !!badge && straxBadgeRemaining(badge) > 0;
}

export function StraxProfileLink({ badge, compact = false }: { badge: ActiveStraxBadge; compact?: boolean }) {
  const { theme, locale } = useApp();
  const router = useRouter();
  const active = useActiveBadge(badge);
  if (!hittingarFeature.enabled || !active) return null;
  return <Pressable hitSlop={compact ? 8 : undefined} accessibilityRole="button" accessibilityLabel={`Strax: ${badge.title}. ${locale === 'is' ? 'Opna Strax' : 'Open Strax'}`}
    onPress={() => router.push(`/hittingar/strax/${encodeURIComponent(badge.id)}` as Href)}
    style={({ pressed }) => [compact ? styles.bubble : styles.profileLink,
      { backgroundColor: compact ? 'rgba(20,20,24,.9)' : theme.colors.accentSoft, borderColor: compact ? 'rgba(255,255,255,.3)' : theme.colors.border }, pressed && { opacity: .8 }]}>
    <StraxLogo size={19} color={compact ? '#FFFFFF' : theme.colors.accent} />
    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.title, { color: compact ? '#FFFFFF' : theme.colors.accent }]}>{compact ? straxBubbleTitle(badge.title) : `Strax · ${badge.title}`}</Text>
    {!compact && <Ionicons name="chevron-forward" size={15} color={theme.colors.accent} />}
  </Pressable>;
}

/** Independent sibling press targets also avoid nested buttons on web. */
export function StraxProfileTile(props: ComponentProps<typeof ProfileTile>) {
  return <View style={styles.wrapper}>
    <ProfileTile {...props} />
    {props.profile.activeStrax && <View pointerEvents="box-none" style={styles.badgePosition}><StraxProfileLink badge={props.profile.activeStrax} compact /></View>}
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  badgePosition: { position: 'absolute', top: 6, left: 6, maxWidth: '75%' },
  bubble: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  profileLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 11, lineHeight: 15, fontWeight: '700', flexShrink: 1 },
});
