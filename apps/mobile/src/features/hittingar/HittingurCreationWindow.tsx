import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';

export function HittingurCreationWindow({
  title,
  children,
  footer,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const { theme, t } = useApp();
  const { reducedMotion } = useAppearance();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 600;

  return (
    <Modal
      transparent
      visible
      animationType={reducedMotion ? 'none' : 'fade'}
      accessibilityLabel={title}
      onRequestClose={() => {
        if (!busy) onClose();
      }}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.scrim,
            paddingTop: Math.max(insets.top, compact ? 8 : 24),
            paddingBottom: Math.max(insets.bottom, compact ? 8 : 24),
            paddingHorizontal: compact ? 8 : 24,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
          disabled={busy}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.window,
            {
              backgroundColor: theme.colors.canvas,
              borderColor: theme.colors.border,
              maxHeight: height - Math.max(insets.top, 24) - Math.max(insets.bottom, 24),
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.titleRow}>
              <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
                <Ionicons name="people-outline" size={22} color={theme.colors.accent} />
              </View>
              <View style={styles.titleCopy}>
                <Text
                  accessibilityRole="header"
                  style={[styles.title, { color: theme.colors.text }]}
                >
                  {title}
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                  {t('hittingar.create.simpleIntro')}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              disabled={busy}
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons name="close" size={24} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  window: {
    width: '100%',
    maxWidth: 620,
    flexShrink: 1,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  titleCopy: { flex: 1, gap: 3 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 22 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
});
