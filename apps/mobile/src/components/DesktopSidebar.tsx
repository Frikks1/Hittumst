import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { selectMainProfilePhoto } from '@/utils/mainProfilePhoto';
import { hittingarFeature } from '@/features/hittingar/config';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { OwnProfile } from '@/types/domain';
import { useChatInbox } from '@/providers/ChatInboxProvider';

export const desktopSidebarBreakpoint = 980;

export function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, t, user, locale } = useApp();
  const { unreadCount } = useChatInbox();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  useEffect(() => {
    let active = true;
    if (!user) { setProfile(null); return; }
    void api.getOwnProfile().then(value => { if (active) setProfile(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [pathname, user?.id]);

  const links: Array<{ href: Href; path: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { href: '/(tabs)/discover', path: '/discover', label: t('tabs.discover'), icon: 'grid-outline' },
    ...(hittingarFeature.enabled ? [{ href: '/(tabs)/hittingar?section=hittingar' as Href, path: '/hittingar', label: locale === 'is' ? 'Hittingar' : 'Meetups', icon: 'calendar-outline' as const }] : []),
    { href: '/(tabs)/chats', path: '/chats', label: t('tabs.chats'), icon: 'chatbubbles-outline' },
    { href: '/(tabs)/samfelag' as Href, path: '/samfelag', label: t('tabs.community'), icon: 'people-outline' },
    { href: '/(tabs)/profile', path: '/profile', label: t('tabs.profile'), icon: 'person-outline' },
  ];
  const mainPhoto = profile ? selectMainProfilePhoto(profile) : undefined;
  const avatar = mainPhoto?.posterUrl ?? mainPhoto?.url;

  return <View style={[styles.sidebar, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.border }]}>
    <Pressable accessibilityRole="link" accessibilityLabel="Hittumst" onPress={() => router.replace('/(tabs)/discover')} style={styles.brand}>
      <Text style={[styles.brandName, { color: theme.colors.accent }]}>Hittumst</Text>
      <View style={[styles.brandDot, { backgroundColor: theme.colors.accent }]} />
    </Pressable>
    <ScrollView contentContainerStyle={styles.navigation}>
      {links.map(link => {
        const selected = pathname === link.path || pathname.startsWith(`${link.path}/`);
        const color = selected ? theme.colors.accent : theme.colors.textMuted;
        return <Pressable key={link.path} accessibilityRole="link" accessibilityLabel={link.path === '/chats' && unreadCount ? `${link.label}. ${t('inbox.unread', { count: unreadCount })}` : link.label} accessibilityState={{ selected }}
          onPress={() => router.push(link.href)} style={({ pressed }) => [styles.link, selected && { backgroundColor: theme.colors.accentSoft }, pressed && styles.pressed]}>
          <Ionicons name={link.icon} size={19} color={color} />
          <Text style={[styles.linkLabel, { color }]}>{link.label}</Text>
          {link.path === '/chats' && unreadCount > 0 && <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}><Text style={{ color: theme.colors.textOnAccent, fontSize: 11, fontWeight: '700' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>}
          {selected && <View style={[styles.activeLine, { backgroundColor: theme.colors.accent }]} />}
        </Pressable>;
      })}
    </ScrollView>
    <View style={[styles.account, { borderTopColor: theme.colors.border }]}>
      <Pressable accessibilityRole="link" accessibilityLabel={t('tabs.settings')} accessibilityState={{ selected: pathname === '/settings' }}
        onPress={() => router.push('/settings')} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Ionicons name="settings-outline" size={19} color={pathname === '/settings' ? theme.colors.accent : theme.colors.textMuted} />
        <Text style={[styles.linkLabel, { color: pathname === '/settings' ? theme.colors.accent : theme.colors.textMuted }]}>{t('tabs.settings')}</Text>
      </Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel={t('tabs.profile')} accessibilityState={{ selected: pathname === '/profile' }}
        onPress={() => router.push('/(tabs)/profile')} style={({ pressed }) => [styles.profile, { backgroundColor: theme.colors.canvas }, pressed && styles.pressed]}>
        {avatar ? <Image source={avatar} contentFit="cover" style={styles.avatar} /> : <View style={[styles.avatar, styles.placeholder, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="person-outline" size={17} color={theme.colors.accent} /></View>}
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={[styles.profileName, { color: theme.colors.text }]}>{profile?.displayName || t('tabs.profile')}</Text>
          <Text style={[styles.profileDetail, { color: theme.colors.textMuted }]}>{t('tabs.profile')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  sidebar: { width: 210, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth, paddingTop: 26 },
  brand: { paddingHorizontal: 24, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 4 },
  brandName: { fontSize: 25, fontWeight: '900', letterSpacing: 0 },
  brandDot: { width: 5, height: 5, borderRadius: 3, marginTop: 12 },
  navigation: { flexGrow: 1, paddingHorizontal: 12, paddingTop: 32, gap: 6 },
  link: { minHeight: 46, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 11, overflow: 'hidden' },
  linkLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  badge: { minWidth: 21, minHeight: 21, borderRadius: 11, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  activeLine: { position: 'absolute', top: 11, bottom: 11, left: 0, width: 3, borderRadius: 2 },
  account: { padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  profile: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 6 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  profileCopy: { flex: 1, gap: 3 },
  profileName: { fontSize: 13, fontWeight: '700' },
  profileDetail: { fontSize: 11 },
  pressed: { opacity: 0.75 },
});
