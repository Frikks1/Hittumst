import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';

export default function LocationGateScreen() {
  const router = useRouter();
  const { t, theme, verifyLocation } = useApp();
  const [status, setStatus] = useState<'idle' | 'checking' | 'denied' | 'outside_iceland' | 'poor_accuracy' | 'error'>('idle');
  const verify = async () => {
    setStatus('checking');
    const result = await verifyLocation();
    if (result === 'verified') router.back(); else setStatus(result);
  };
  const title = status === 'denied' ? t('location.deniedTitle') : status === 'outside_iceland' ? t('location.outsideTitle') : status === 'poor_accuracy' ? t('location.accuracyTitle') : status === 'error' ? t('location.serverTitle') : t('onboarding.locationTitle');
  const body = status === 'denied' ? t('location.deniedBody') : status === 'outside_iceland' ? t('location.outsideBody') : status === 'poor_accuracy' ? t('location.accuracyBody') : status === 'error' ? t('location.serverBody') : t('onboarding.locationBody');
  return (
    <Screen back>
      <View style={styles.page}>
        <View style={[styles.pin, { backgroundColor: theme.colors.accentSoft }]}><Text style={styles.pinEmoji}>📍</Text></View>
        <Text style={[textStyles.title, { color: theme.colors.text, textAlign: 'center' }]}>{title}</Text>
        <Text style={[textStyles.body, { color: theme.colors.textMuted, textAlign: 'center' }]}>{body}</Text>
        <Text style={[styles.privacy, { color: theme.colors.textMuted }]}>{t('onboarding.locationPrivacy')}</Text>
        <Button loading={status === 'checking'} icon="location-outline" label={status === 'checking' ? t('location.checking') : t('location.verifyAgain')} onPress={() => void verify()} />
        {status === 'denied' && <Button variant="secondary" label={t('location.openSettings')} onPress={() => void Linking.openSettings()} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, minHeight: 620, padding: 28, justifyContent: 'center', alignItems: 'stretch', gap: 18 }, pin: { width: 86, height: 86, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, pinEmoji: { fontSize: 42 }, privacy: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginVertical: 8 } });
