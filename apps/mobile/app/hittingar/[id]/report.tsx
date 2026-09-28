import { Text } from '@/components/Typography';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, Field, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import type { MeetupReportCategory } from '@/types/domain';

const reasons = ['minor_suspected', 'harassment', 'coercion_non_consent', 'dangerous_location', 'misrepresentation', 'hate_discrimination', 'spam_advertising', 'trafficking_exploitation', 'illegal_activity', 'compensated_sexual_services', 'other'] as const satisfies readonly MeetupReportCategory[];
const meetupApi = api as RummalApi;

export default function ReportHittingurScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, theme } = useApp();
  const [reason, setReason] = useState<MeetupReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!id || !reason) return;
    setSending(true);
    try {
      await meetupApi.reportMeetup(id, { category: reason, details: details.trim() || undefined });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen back title={t('hittingar.report.title')}>
      <View style={styles.page}>
        {sent ? (
          <View style={styles.sent}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.report.sentTitle')}</Text>
            <Text style={[textStyles.body, styles.center, { color: theme.colors.textMuted }]}>{t('hittingar.report.sentBody')}</Text>
            <Button label={t('common.done')} onPress={() => router.back()} />
          </View>
        ) : (
          <>
            <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('hittingar.report.body')}</Text>
            <View style={styles.wrap}>{reasons.map((value) => <ChoiceChip key={value} label={t(`hittingar.report.reason.${value}`)} selected={reason === value} onPress={() => setReason(value)} />)}</View>
            <Field label={t('hittingar.report.details')} value={details} onChangeText={setDetails} multiline placeholder={t('hittingar.report.placeholder')} />
            <Button label={t('hittingar.report.submit')} variant="danger" disabled={!reason} loading={sending} onPress={() => void submit()} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { padding: 20, paddingBottom: 40, gap: 18 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, sent: { minHeight: 420, justifyContent: 'center', alignItems: 'center', gap: 16 }, center: { textAlign: 'center' } });
