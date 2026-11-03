import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Text } from '@/components/Typography';
import { profileActivityCopy } from '@/i18n/profileActivity';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';

export function ProfileViewsLink({ pill = false }: { pill?: boolean }) {
  const { user, locationAllowed, locale, theme } = useApp();
  const copy = profileActivityCopy(locale);
  const [count, setCount] = useState<{ accountId: string; label: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [pressed, setPressed] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setCount(null);
    setLoading(Boolean(user && locationAllowed));
    if (user && locationAllowed) {
      const accountId = user.id;
      void api.listProfileActivity('views').then(page => {
        if (active) setCount({ accountId, label: `${page.items.length}${page.nextCursor ? '+' : ''}` });
      }).catch(() => undefined).finally(() => {
        if (active) setLoading(false);
      });
    }
    return () => { active = false; };
  }, [user?.id, locationAllowed]));

  const label = user && locationAllowed && count?.accountId === user.id ? count.label : '—';
  return <Link href="/interest?tab=views" asChild><Pressable
    accessibilityRole="link"
    accessibilityLabel={`${copy.views}: ${label}`}
    accessibilityHint={copy.openViews}
    accessibilityState={{ busy: loading }}
    onPressIn={() => setPressed(true)}
    onPressOut={() => setPressed(false)}
    style={StyleSheet.flatten([styles.link, pill && styles.pill, {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    }, pressed && styles.pressed])}
  >
    <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no" style={styles.emoji}>👁️</Text>
    <Text style={[styles.label, { color: theme.colors.text }]}>{copy.views}</Text>
    <Text accessibilityLiveRegion="polite" style={[styles.count, { color: theme.colors.accent }]}>{label}</Text>
  </Pressable></Link>;
}

const styles = StyleSheet.create({
  link: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  pill: { borderRadius: 22 },
  emoji: { fontSize: 18, lineHeight: 24 },
  label: { fontSize: 12, fontWeight: '600' },
  count: { minWidth: 24, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
