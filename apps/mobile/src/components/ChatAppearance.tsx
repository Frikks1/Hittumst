import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import type { AppearancePreferences } from '@/theme/appearance';
import type { AppTheme } from '@/theme/tokens';

export function chatBubbleColors(theme: AppTheme, preferences: AppearancePreferences) {
  return preferences.chatBubble === 'neutral'
    ? { sent: theme.colors.surfaceMuted, sentText: theme.colors.text, received: theme.colors.surfaceRaised }
    : { sent: theme.colors.accent, sentText: theme.colors.textOnAccent, received: theme.colors.surfaceRaised };
}
export function ChatBackdrop() {
  const { theme } = useApp();
  const { appearance } = useAppearance();
  if (appearance.chatBackground === 'glow') return <LinearGradient pointerEvents="none" colors={[theme.colors.accentSoft, theme.colors.canvas, theme.colors.surface]} style={StyleSheet.absoluteFill} />;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: appearance.chatBackground === 'soft' ? theme.colors.surface : theme.colors.canvas }]} />;
}
