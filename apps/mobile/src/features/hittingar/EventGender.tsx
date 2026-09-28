import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { identitySchema } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';

export function EventGender({ id, onSaved }: { id: string; onSaved: () => void }) {
  const { t, theme } = useApp();
  const [gender, setGender] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void api.getMeetupGender(id).then(value => { if (active) setGender(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [id]));
  const save = async () => {
    setBusy(true); setError(false);
    try { await api.setMeetupGender(id, gender); setSaved(true); onSaved(); }
    catch { setError(true); } finally { setBusy(false); }
  };
  return <View style={{ gap: 12, padding: 16, borderRadius: 18, backgroundColor: theme.colors.surface }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('event.myGender')}</Text>
    <Text style={{ color: theme.colors.textMuted, lineHeight: 21 }}>{t('event.genderHint')}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <ChoiceChip label={t('event.notSet')} selected={gender === null} onPress={() => { setGender(null); setSaved(false); }} />
      {identitySchema.options.map(value => <ChoiceChip key={value} label={t(`event.gender.${value}`)} selected={gender === value} onPress={() => { setGender(value); setSaved(false); }} />)}
    </View>
    <Button label={t(saved ? 'event.saved' : 'common.save')} loading={busy} onPress={() => void save()} />
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('event.error')}</Text>}
  </View>;
}
