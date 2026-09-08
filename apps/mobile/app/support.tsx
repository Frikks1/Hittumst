import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TrustBanner, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { runtimeEnv } from '@/services';

export default function SupportScreen() {
  const { t, theme, locale } = useApp();
  const [linkFailed, setLinkFailed] = useState(false);
  const open = async (url: string) => { setLinkFailed(false); try { await Linking.openURL(url); } catch { setLinkFailed(true); } };
  const cards = [
    ['support.emergencyTitle', 'support.emergencyBody', '🚨'],
    ['support.reportTitle', 'support.reportBody', '🛡️'],
    ['support.guidelines', 'support.guidelinesBody', '🤝'],
    ['support.contactTitle', 'support.contactBody', '✉️'],
  ] as const;
  return (
    <Screen back title={t('support.title')}>
      <View style={styles.page}>
        <TrustBanner icon="heart-circle-outline" title={t('support.title')} body={t('support.guidelinesBody')} />
        {cards.map(([title, body, emoji]) => (
          <View key={title} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={styles.emoji}>{emoji}</Text>
            <View style={styles.copy}><Text style={[textStyles.heading, { color: theme.colors.text }]}>{t(title)}</Text><Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{body === 'support.contactBody' && !runtimeEnv.supportEmail ? t('support.contactPending') : t(body, body === 'support.contactBody' ? { email: runtimeEnv.supportEmail } : undefined)}</Text></View>
          </View>
        ))}
        {runtimeEnv.supportEmail && <Button icon="mail-outline" label={t('support.email')} onPress={() => void open(`mailto:${runtimeEnv.supportEmail}`)} />}
        {runtimeEnv.websiteUrl && <View style={styles.policies}>{([['privacy', 'support.privacyNotice'], ['terms', 'support.terms'], ['community', 'support.guidelines'], ['child-safety', 'support.childSafety'], ['delete-account', 'privacy.delete']] as const).map(([path, label]) => <Button key={path} variant="secondary" icon="open-outline" label={t(label)} onPress={() => void open(`${runtimeEnv.websiteUrl}/${path}${locale === 'en' ? '?lang=en' : ''}`)} />)}</View>}
        {linkFailed && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('support.linkFailed')}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { padding: 22, gap: 12 }, card: { borderWidth: 1, borderRadius: 20, padding: 17, flexDirection: 'row', gap: 13 }, emoji: { fontSize: 25 }, copy: { flex: 1, gap: 5 }, policies: { gap: 10 } });
