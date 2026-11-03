import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '@/providers/AppProvider';
import { onboardingChecklistCopy } from '@/i18n/onboardingChecklist';
import { dismissOnboardingChecklist, getOnboardingChecklist, type ChecklistStatus } from '@/features/onboarding/checklistStorage';
import type { OwnProfile } from '@/types/domain';
import { Text } from './Typography';

export function OnboardingChecklist({ profile }: { profile: OwnProfile | null }) {
  const { user, locale, theme } = useApp();
  const router = useRouter();
  const copy = onboardingChecklistCopy(locale);
  const [state, setState] = useState<{ accountId: string; status: ChecklistStatus } | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (user) void getOnboardingChecklist(user.id).then(status => { if (active) setState({ accountId: user.id, status }); }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id]));
  if (!user || !profile || profile.id !== user.id || state?.accountId !== user.id || !state.status.active || state.status.dismissed) return null;
  const rows = [
    { key: 'photos', label: copy.photo, done: profile.photos.some(photo => photo.status !== 'rejected'), icon: 'camera-outline' as const },
    { key: 'prompt', label: copy.prompt, done: !!profile.conversationPrompt?.trim(), icon: 'chatbubble-ellipses-outline' as const },
    { key: 'interests', label: copy.interests, done: profile.interests.length > 0, icon: 'sparkles-outline' as const },
    { key: 'conversation', label: copy.conversation, done: state.status.conversationStarted, icon: 'people-outline' as const },
  ];
  const done = rows.filter(row => row.done).length;
  if (done === rows.length) return null;
  return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{copy.title}</Text>
    <Text style={[styles.body, { color: theme.colors.textMuted }]}>{copy.body}</Text>
    <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: theme.colors.accent }]}>{copy.progress(done)}</Text>
    {rows.map(row => <Pressable key={row.key} accessibilityRole="button" accessibilityLabel={`${row.label}. ${row.done ? copy.completed : copy.open}`}
      onPress={() => row.key === 'conversation' ? router.push('/(tabs)/chats') : router.push({ pathname: '/(tabs)/profile', params: { section: row.key } })}
      style={({ pressed }) => [styles.row, { borderColor: theme.colors.border }, pressed && { opacity: 0.75 }]}>
      <Ionicons accessible={false} name={row.done ? 'checkmark-circle' : row.icon} size={21} color={row.done ? theme.colors.accent : theme.colors.textMuted} />
      <Text style={[styles.label, { color: theme.colors.text }]}>{row.label}</Text>
      <Ionicons accessible={false} name="chevron-forward" size={17} color={theme.colors.textMuted} />
    </Pressable>)}
    <Pressable accessibilityRole="button" onPress={() => {
      setState({ accountId: user.id, status: { ...state.status, dismissed: true } });
      void dismissOnboardingChecklist(user.id).catch(() => undefined);
    }} style={styles.dismiss}><Text style={[styles.body, { color: theme.colors.textMuted }]}>{copy.dismiss}</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 8, marginVertical: 4 },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 20 },
  progress: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  label: { flex: 1, flexShrink: 1, fontSize: 14, lineHeight: 21 },
  dismiss: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8 },
});
