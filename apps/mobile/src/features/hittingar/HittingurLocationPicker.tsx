import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/providers/AppProvider';
import type { GeoCoordinate } from '@/types/domain';

export type HittingurLocationPickerProps = {
  value: GeoCoordinate | null;
  onChange: (value: GeoCoordinate) => void;
};

export default function HittingurLocationPicker(_: HittingurLocationPickerProps) {
  const { t, theme } = useApp();
  return <View style={[styles.root, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={{ color: theme.colors.textMuted }}>{t('hittingar.create.pinMapUnavailable')}</Text></View>;
}

const styles = StyleSheet.create({ root: { height: 160, borderRadius: 18, padding: 20, alignItems: 'center', justifyContent: 'center' } });
