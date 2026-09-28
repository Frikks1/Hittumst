import { Text } from '@/components/Typography';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Brand, Button, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { authService, runtimeEnv } from '@/services';

export default function WelcomeScreen() {
  const router = useRouter();
  const { theme, t, demo, ready, user } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (ready && runtimeEnv.bypassAuth) {
    return <Redirect href="/(tabs)/discover" />;
  }

  if (ready && user && !demo) return <Redirect href="/onboarding" />;

  const social = async (provider: 'apple' | 'google') => {
    if (busy) return;
    setBusy(true); setError(false);
    try { await authService.signInWithProvider(provider); router.push('/onboarding'); }
    catch { setError(true); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <LinearGradient colors={[theme.colors.canvas, theme.colors.accentSoft]} style={styles.page}>
        <View style={styles.top}>
          <Brand />
          <View style={[styles.countryPill, { backgroundColor: theme.colors.surfaceRaised }]}>
            <Text style={[styles.country, { color: theme.colors.text }]}>{t('brand.country')}</Text>
          </View>
        </View>
        <View style={styles.hero}>
          <Text style={[textStyles.eyebrow, { color: theme.colors.lava }]}>
            18+ · LGBTQ+ · Ísland
          </Text>
          <Text style={[textStyles.hero, { color: theme.colors.text }]}>
            {t('auth.welcomeTitle')}
          </Text>
          <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>
            {t('auth.welcomeBody')}
          </Text>
          <View style={styles.art} accessibilityElementsHidden>
            <View
              style={[styles.artCard, styles.artCardLeft, { backgroundColor: theme.colors.accent }]}
            />
            <View
              style={[styles.artCard, styles.artCardRight, { backgroundColor: theme.colors.lava }]}
            />
            <View style={[styles.artBubble, { backgroundColor: theme.colors.surfaceRaised }]}>
              <Text style={{ color: theme.colors.text, fontSize: 30 }}>Halló.</Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('auth.failed')}</Text>}
          <Button
            label={t('auth.email')}
            icon="mail-outline"
            onPress={() => router.push('/auth/email')}
          />
          <View style={styles.socialRow}>
            <View style={styles.flex}>
              <Button
                variant="secondary"
                disabled={busy}
                label={t('auth.apple')}
                icon="logo-apple"
                onPress={() => void social('apple')}
              />
            </View>
            <View style={styles.flex}>
              <Button
                variant="secondary"
                disabled={busy}
                label={t('auth.google')}
                icon="logo-google"
                onPress={() => void social('google')}
              />
            </View>
          </View>
          {demo && (
            <Button
              variant="ghost"
              label={t('common.demo')}
              icon="sparkles-outline"
              onPress={() => router.push('/onboarding')}
            />
          )}
          <Text style={[styles.legal, { color: theme.colors.textMuted }]}>{t('auth.legal')}</Text>
        </View>
      </LinearGradient>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  countryPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  country: { fontSize: 12, fontWeight: '800' },
  hero: { gap: 14 },
  art: { height: 210, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  artCard: { position: 'absolute', width: 142, height: 175, borderRadius: 28, opacity: 0.9 },
  artCardLeft: { transform: [{ rotate: '-10deg' }], left: 34 },
  artCardRight: { transform: [{ rotate: '9deg' }], right: 34 },
  artBubble: {
    width: 170,
    height: 94,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  actions: { gap: 10 },
  socialRow: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  legal: { textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 4 },
});
