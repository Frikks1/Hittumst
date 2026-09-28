import { Text } from '@/components/Typography';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Field, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { authService } from '@/services';

export default function EmailAuthScreen() {
  const router = useRouter();
  const { t, theme } = useApp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!sent && !/^\S+@\S+\.\S+$/.test(email)) return setError(t('auth.invalidEmail'));
    if (sent && !/^\d{6}$/.test(code)) return setError(t('auth.invalidCode'));
    setLoading(true);
    try {
      if (!sent) {
        await authService.requestEmailOtp(email.trim().toLowerCase());
        setSent(true);
      } else {
        await authService.verifyEmailOtp(email.trim().toLowerCase(), code);
        router.replace('/onboarding');
      }
    } catch {
      setError(t('auth.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen back>
      <View style={styles.page}>
        <Text style={[textStyles.eyebrow, { color: theme.colors.lava }]}>Hittumst · 18+</Text>
        <Text style={[textStyles.title, { color: theme.colors.text }]}>{sent ? t('auth.verifyTitle') : t('auth.emailTitle')}</Text>
        <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>
          {sent ? t('auth.verifyBody', { email }) : t('auth.emailBody')}
        </Text>
        <View style={styles.form}>
          {!sent ? (
            <Field label={t('auth.emailLabel')} value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="nafn@example.is" />
          ) : (
            <Field label={t('auth.codeLabel')} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" />
          )}
          {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>}
          <Button label={sent ? t('auth.verify') : t('auth.sendCode')} onPress={() => void submit()} loading={loading} />
          {sent && <Button label={t('auth.resend')} variant="ghost" onPress={() => { setSent(false); setCode(''); }} />}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' }, form: { marginTop: 18, gap: 14 } });
