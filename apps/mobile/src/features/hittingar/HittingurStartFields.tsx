import { StyleSheet, View } from 'react-native';
import { Field } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';

export type HittingurStartFieldsProps = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  disabled?: boolean;
};

export default function HittingurStartFields({ date, time, onDateChange, onTimeChange, disabled }: HittingurStartFieldsProps) {
  const { t } = useApp();
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <Field label={t('hittingar.create.startDateLabel')} value={date} onChangeText={onDateChange} placeholder="YYYY-MM-DD" maxLength={10} editable={!disabled} />
      </View>
      <View style={styles.field}>
        <Field label={t('hittingar.create.startTimeLabel')} value={time} onChangeText={onTimeChange} placeholder="HH:MM" maxLength={5} editable={!disabled} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, minWidth: 0 },
});
