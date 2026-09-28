import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { StartupGate } from '@/components/StartupGate';
import { Button, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { browserAuthCompletion, completeOAuthCallback } from '@/services/auth';

export default function AuthCallbackScreen() {
  const { code, error, error_code: errorCode } = useLocalSearchParams<{
    code?: string | string[]; error?: string; error_code?: string;
  }>();
  const { t, theme } = useApp();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // The web popup hands its URL to the original window, which owns the exchange.
    if (browserAuthCompletion.type === 'success') return;
    let active = true;
    if (error || errorCode || typeof code !== 'string' || !code.trim()) {
      setFailed(true);
      return;
    }
    void completeOAuthCallback(code).then(() => {
      if (active) router.replace('/onboarding');
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [code, error, errorCode, router]);

  if (!failed) return <StartupGate />;
  return <Screen title={t('auth.verifyTitle')}><View style={styles.page}>
    <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('auth.failed')}</Text>
    <Button label={t('auth.email')} onPress={() => router.replace('/auth/email')} />
    <Button label={t('common.back')} variant="secondary" onPress={() => router.replace('/')} />
  </View></Screen>;
}
const styles = StyleSheet.create({ page: { padding: 24, gap: 16 } });
