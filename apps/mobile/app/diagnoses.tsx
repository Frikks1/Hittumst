import { useEffect, useRef, useState } from 'react';
import { Switch, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { diagnosisIdSchema, type DiagnosisId, type DiagnosisRecord } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import type { TranslationKey } from '@/i18n/translations';
import {
  diagnosisReleaseEnabled,
  listDiagnoses,
  submitDiagnosis,
  discloseDiagnosis,
  withdrawDiagnosis,
} from '@/services/diagnoses';
import { confirmAction } from '@/utils/confirmAction';

export default function DiagnosesScreen() {
  const {
    t,
    theme,
    user,
    locale,
    discoveryFilters,
    setDiscoveryFilters,
    meetupFilters,
    setMeetupFilters,
  } = useApp();
  const [enabled, setEnabled] = useState(false),
    [records, setRecords] = useState<DiagnosisRecord[]>([]);
  const [diagnosisId, setDiagnosisId] = useState<DiagnosisId>('autism'),
    [legalName, setLegalName] = useState('');
  const [consent, setConsent] = useState(false),
    [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const revision = ++generation.current;
    setRecords([]);
    setLegalName('');
    setAsset(null);
    setConsent(false);
    setEnabled(false);
    setBusy(false);
    setError(false);
    void Promise.all([diagnosisReleaseEnabled(), listDiagnoses()])
      .then(([live, items]) => {
        if (generation.current === revision) {
          setEnabled(live);
          setRecords(items);
        }
      })
      .catch(() => {
        if (generation.current === revision) setError(true);
      });
    return () => {
      generation.current++;
    };
  }, [user?.id]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    const revision = generation.current;
    setBusy(true);
    setError(false);
    try {
      await work();
      const items = await listDiagnoses();
      if (revision === generation.current) {
        setRecords(items);
        setAsset(null);
        setLegalName('');
        setConsent(false);
      }
    } catch {
      if (revision === generation.current) setError(true);
    } finally {
      if (revision === generation.current) setBusy(false);
    }
  };
  const muted = { color: theme.colors.textMuted },
    text = { color: theme.colors.text };
  return (
    <Screen back title={t('diagnosis.title')}>
      <View style={{ padding: 22, gap: 18 }}>
        <Text style={muted}>{t('diagnosis.help')}</Text>
        <Text style={muted}>{t('diagnosis.evidenceHelp')}</Text>
        {!enabled && (
          <Text accessibilityRole="alert" style={muted}>
            {t('diagnosis.unavailable')}
          </Text>
        )}
        {error && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {t('diagnosis.error')}
          </Text>
        )}
        {records.map((record) => (
          <View
            key={record.id}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 16,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={text}>
              {t(('diagnosis.' + record.diagnosisId) as TranslationKey)} ·{' '}
              {t(('diagnosis.' + record.status) as TranslationKey)}
            </Text>
            {record.reason && (
              <Text style={muted}>{t(('diagnosis.' + record.reason) as TranslationKey)}</Text>
            )}
            {record.status === 'approved' && (
              <View style={{ gap: 8 }}>
                <Text style={text}>{t('diagnosis.discoverable')}</Text>
                <Switch
                  accessibilityLabel={t('diagnosis.discoverable')}
                  disabled={busy || !enabled}
                  value={record.discoverable}
                  onValueChange={(v) => void run(() => discloseDiagnosis(record.id, v))}
                />
              </View>
            )}
            {['pending', 'more_information', 'approved', 'rejected', 'revoked'].includes(
              record.status,
            ) && (
              <Button
                variant="secondary"
                disabled={busy}
                label={t('diagnosis.withdraw')}
                onPress={() =>
                  confirmAction({
                    title: t('diagnosis.withdraw'),
                    message:
                      locale === 'is'
                        ? 'Þú missir þátttökurétt í hittingum sem krefjast þessarar greiningar.'
                        : 'You will lose participation in meetups that require this diagnosis.',
                    cancelLabel: t('common.cancel'),
                    confirmLabel: t('diagnosis.withdraw'),
                    destructive: true,
                    onConfirm: () =>
                      run(async () => {
                        await withdrawDiagnosis(record.id);
                        setDiscoveryFilters({ ...discoveryFilters, diagnosisIds: [] });
                        setMeetupFilters({ ...meetupFilters, diagnosisIds: [] });
                      }),
                  })
                }
              />
            )}
            {enabled &&
              ['more_information', 'rejected', 'revoked', 'expired', 'withdrawn'].includes(
                record.status,
              ) && (
                <Button
                  variant="ghost"
                  label={t('diagnosis.resubmit')}
                  onPress={() => {
                    setDiagnosisId(record.diagnosisId);
                    setConsent(false);
                  }}
                />
              )}
          </View>
        ))}
        {enabled && (
          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {diagnosisIdSchema.options.map((id) => (
                <ChoiceChip
                  key={id}
                  selected={id === diagnosisId}
                  label={t(('diagnosis.' + id) as TranslationKey)}
                  onPress={() => setDiagnosisId(id)}
                />
              ))}
            </View>
            <TextInput
              accessibilityLabel={t('diagnosis.legalName')}
              placeholder={t('diagnosis.legalName')}
              placeholderTextColor={theme.colors.textMuted}
              value={legalName}
              onChangeText={setLegalName}
              maxLength={160}
              autoComplete="off"
              autoCorrect={false}
              style={{
                ...text,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 16,
              }}
            />
            <Text style={text}>{t('diagnosis.consent')}</Text>
            <Switch
              accessibilityLabel={t('diagnosis.consent')}
              value={consent}
              onValueChange={setConsent}
              disabled={busy}
            />
            <Button
              variant="secondary"
              disabled={busy || !consent}
              label={t('diagnosis.choose') + (asset ? ' ✓' : '')}
              onPress={() =>
                void (async () => {
                  try {
                    const revision = generation.current;
                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ['images'],
                      allowsEditing: false,
                      quality: 1,
                      exif: false,
                    });
                    if (revision === generation.current && !result.canceled) {
                      const picked = result.assets[0];
                      if (!picked || !['image/jpeg', 'image/png'].includes(picked.mimeType ?? '')) {
                        setError(true);
                        return;
                      }
                      setAsset(picked);
                    }
                  } catch {
                    setError(true);
                  }
                })()
              }
            />
            <Button
              disabled={busy || !consent || legalName.trim().length < 2 || !asset}
              loading={busy}
              label={t('diagnosis.submit')}
              onPress={() =>
                void run(() =>
                  submitDiagnosis(
                    { diagnosisId, legalName, consent: true },
                    asset!.uri,
                    asset!.mimeType!,
                    user!.id,
                  ),
                )
              }
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
