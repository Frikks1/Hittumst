import { useId, type CSSProperties } from 'react';
import { useAppearance } from '@/providers/AppearanceProvider';
import { useApp } from '@/providers/AppProvider';
import { appearanceFont } from '@/theme/appearance';
import type { HittingurStartFieldsProps } from './HittingurStartFields';

export type { HittingurStartFieldsProps } from './HittingurStartFields';

export default function HittingurStartFields({ date, time, onDateChange, onTimeChange, disabled }: HittingurStartFieldsProps) {
  const { t, theme } = useApp();
  const { appearance } = useAppearance();
  const id = useId();
  const fontFamily = appearanceFont(appearance.font, 'web') ?? 'system-ui, sans-serif';
  const labelStyle: CSSProperties = { ...styles.label, color: theme.colors.textMuted, fontFamily, fontSize: 12 * appearance.textScale };
  const inputStyle: CSSProperties = {
    ...styles.input,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    colorScheme: theme.dark ? 'dark' : 'light',
    fontFamily,
    fontSize: 15 * appearance.textScale,
    opacity: disabled ? 0.6 : 1,
  };
  return (
    <div style={styles.row}>
      <label htmlFor={`${id}-date`} style={labelStyle}>
        {t('hittingar.create.startDateLabel')}
        <input id={`${id}-date`} type="date" value={date} onChange={event => onDateChange(event.currentTarget.value)} disabled={disabled} style={inputStyle} />
      </label>
      <label htmlFor={`${id}-time`} style={labelStyle}>
        {t('hittingar.create.startTimeLabel')}
        <input id={`${id}-time`} type="time" value={time} onChange={event => onTimeChange(event.currentTarget.value)} disabled={disabled} step={60} style={inputStyle} />
      </label>
    </div>
  );
}

const styles: Record<'row' | 'label' | 'input', CSSProperties> = {
  row: { display: 'flex', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 8, fontWeight: 700, textTransform: 'uppercase' },
  input: { boxSizing: 'border-box', width: '100%', minWidth: 0, height: 44, border: '1px solid', borderRadius: 8, padding: '0 14px', fontWeight: 400 },
};
