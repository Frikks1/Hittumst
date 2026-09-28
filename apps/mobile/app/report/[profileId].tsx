import { Text } from '@/components/Typography';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, Field, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { ReportCategory } from '@/types/domain';

const categories: ReportCategory[] = ['harassment', 'hate', 'impersonation', 'minor', 'intimate', 'spam', 'other'];

export default function ReportScreen() {
  const { profileId, conversationId, albumShareId, albumItemId } = useLocalSearchParams<{ profileId: string; conversationId?: string; albumShareId?: string; albumItemId?: string }>();
  const router = useRouter();
  const { t, theme } = useApp();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [notes, setNotes] = useState('');
  const [sent, setSent] = useState(false);
  const submit = async () => {
    if (!category) return;
    await api.report({ profileId, category, notes: notes.trim() || undefined, conversationId, albumShareId, albumItemId });
    setSent(true);
  };

  return (
    <Screen back title={t('report.title')}>
      <View style={styles.page}>
        {sent ? (
          <View style={styles.success}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={[textStyles.title, { color: theme.colors.text, textAlign: 'center' }]}>{t('report.sentTitle')}</Text>
            <Text style={[textStyles.body, { color: theme.colors.textMuted, textAlign: 'center' }]}>{t('report.sentBody')}</Text>
            <Button label={t('common.done')} onPress={() => router.back()} />
          </View>
        ) : (
          <>
            <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('report.body')}</Text>
            <Text style={[styles.label, { color: theme.colors.text }]}>{t('report.category')}</Text>
            <View style={styles.chips}>{categories.map((item) => <ChoiceChip key={item} label={t(`report.${item}`)} selected={category === item} onPress={() => setCategory(item)} />)}</View>
            <Field label={t('report.notes')} value={notes} onChangeText={setNotes} multiline placeholder={t('report.notesPlaceholder')} />
            <Button label={t('common.submit')} disabled={!category} onPress={() => void submit()} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { padding: 22, gap: 18 }, label: { fontWeight: '800' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, success: { minHeight: 500, justifyContent: 'center', alignItems: 'center', gap: 16 }, successIcon: { color: '#fff', backgroundColor: '#198754', borderRadius: 28, width: 56, height: 56, textAlign: 'center', textAlignVertical: 'center', fontSize: 30 } });
