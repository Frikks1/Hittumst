import { useCallback } from 'react';
import { type Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StraxMessageReference } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { StraxLogo } from '@/features/strax/components';
import { useStraxResource } from '@/features/strax/hooks';
import { straxIsActive } from '@/features/strax/model';
import { hittingarFeature } from '@/features/hittingar/config';
import { straxApi } from '@/services/strax';
import { useApp } from '@/providers/AppProvider';

export function StraxMessageCard({ reference }: { reference: StraxMessageReference }) {
  const { theme, locale } = useApp(); const router = useRouter();
  const load = useCallback(() => straxApi.get(reference.id), [reference.id]);
  const resource = useStraxResource(load, `share:${reference.id}`);
  const active = resource.data && straxIsActive(resource.data, resource.now);
  const label = resource.loading && !resource.data ? (locale === 'is' ? 'Opna Strax' : 'Open Strax')
    : active ? (locale === 'is' ? 'Opna Strax' : 'Open Strax')
    : locale === 'is' ? 'Útrunnið eða ekki tiltækt · Skoða' : 'Expired or unavailable · View';
  return <Pressable disabled={!hittingarFeature.enabled} accessibilityRole="button" accessibilityLabel={`Strax: ${reference.title}. ${label}`}
    onPress={() => router.push(`/hittingar/strax/${encodeURIComponent(reference.id)}` as Href)}
    style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.border }, pressed && { opacity: .8 }]}>
    <StraxLogo size={25} /><View style={styles.copy}><Text numberOfLines={2} style={[styles.title, { color: theme.colors.text }]}>{reference.title}</Text><Text style={{ color: theme.colors.accent, fontSize: 12 }}>{label}</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { minHeight: 56, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flex: 1, gap: 4 },
  title: { fontWeight: '700', fontSize: 14 },
});
