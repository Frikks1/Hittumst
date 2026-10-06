import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Brand, Button, Screen, textStyles } from '@/components/ui';
import { welcomeCopy } from '@/i18n/welcome';
import { useApp } from '@/providers/AppProvider';
import { authService, runtimeEnv } from '@/services';
import type { AuthProvider } from '@/services/types';

export default function WelcomeScreen() {
  const router = useRouter();
  const { theme, t, locale, setLocale, demo, ready, user } = useApp();
  const copy = welcomeCopy(locale);
  const [pendingProvider, setPendingProvider] = useState<AuthProvider | null>(null);
  const [error, setError] = useState(false);
  const [showInstagramInfo, setShowInstagramInfo] = useState(false);
  const socialPending = useRef(false);

  if (ready && runtimeEnv.bypassAuth) return <Redirect href="/(tabs)/discover" />;
  if (ready && user && !demo) return <Redirect href="/onboarding" />;

  const social = async (provider: AuthProvider) => {
    if (socialPending.current) return;
    socialPending.current = true;
    setPendingProvider(provider);
    setError(false);
    try {
      await authService.signInWithProvider(provider);
      router.replace('/onboarding');
    } catch (failure) {
      // Closing a provider's sheet is an ordinary way to return to this screen.
      if (!/cancel|dismiss|ERR_REQUEST_CANCELED/i.test(String(failure))) setError(true);
    } finally {
      socialPending.current = false;
      setPendingProvider(null);
    }
  };

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.top}>
          <Brand />
          <Pressable accessibilityRole="button" accessibilityLabel={copy.language}
            onPress={() => setLocale(locale === 'is' ? 'en' : 'is')}
            style={({ pressed }) => [styles.language, { backgroundColor: theme.colors.surfaceRaised, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="globe-outline" size={17} color={theme.colors.textMuted} />
            <Text style={[styles.languageLabel, { color: theme.colors.text }]}>{locale === 'is' ? 'EN' : 'IS'}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <LinearGradient colors={[theme.colors.accentSoft, theme.colors.canvas]} style={styles.halo}>
            <View style={[styles.hello, { backgroundColor: theme.colors.accent }]}>
              <Ionicons name="chatbubble-ellipses" size={36} color={theme.colors.textOnAccent} />
            </View>
          </LinearGradient>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>{copy.welcome}</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{copy.title}</Text>
          <Text style={[textStyles.body, styles.body, { color: theme.colors.textMuted }]}>{copy.body}</Text>
          <Text style={[styles.community, { color: theme.colors.textMuted }]}>18+ · LGBTQ+ · Ísland</Text>
        </View>

        <View style={styles.actions}>
          {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('auth.failed')}</Text>}
          <Button label={t('auth.email')} icon="mail-outline" disabled={pendingProvider !== null}
            onPress={() => router.push('/auth/email')} />
          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.dividerLabel, { color: theme.colors.textMuted }]}>{copy.social}</Text>
            <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
          </View>
          {([
            ['apple', t('auth.apple'), 'logo-apple'],
            ['google', t('auth.google'), 'logo-google'],
            ['facebook', copy.facebook, 'logo-facebook'],
          ] as const).map(([provider, label, icon]) => (
            <Button key={provider} variant="secondary" label={label} icon={icon}
              disabled={pendingProvider !== null} loading={pendingProvider === provider}
              onPress={() => void social(provider)} />
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={copy.instagram}
            accessibilityState={{ expanded: showInstagramInfo }}
            onPress={() => setShowInstagramInfo(value => !value)}
            style={({ pressed }) => [styles.instagram, { opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="logo-instagram" size={19} color={theme.colors.textMuted} />
            <Text style={[styles.instagramLabel, { color: theme.colors.textMuted }]}>{copy.instagram}</Text>
            <Ionicons name={showInstagramInfo ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textMuted} />
          </Pressable>
          {showInstagramInfo && <Text style={[styles.legal, { color: theme.colors.textMuted }]}>{copy.instagramBody}</Text>}
          {demo && <Button variant="ghost" label={t('common.demo')} icon="sparkles-outline"
            disabled={pendingProvider !== null} onPress={() => router.push('/onboarding')} />}
        </View>

        <View style={styles.privacy}>
          <Ionicons name="shield-checkmark-outline" size={17} color={theme.colors.textMuted} />
          <Text style={[styles.legal, { color: theme.colors.textMuted }]}>{copy.privateBody}{'\n'}{t('auth.legal')}</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', padding: 24, gap: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  language: { minWidth: 64, minHeight: 44, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  languageLabel: { fontSize: 12, fontWeight: '700' },
  hero: { alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 8 },
  halo: { width: 112, height: 90, borderRadius: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  hello: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', textAlign: 'center', letterSpacing: -0.8 },
  body: { textAlign: 'center', maxWidth: 330 },
  community: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  actions: { gap: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  line: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 12, lineHeight: 18 },
  instagram: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  instagramLabel: { fontSize: 13, lineHeight: 19, flexShrink: 1, textAlign: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 8, marginTop: 'auto' },
  legal: { flexShrink: 1, textAlign: 'center', fontSize: 12, lineHeight: 18 },
});
