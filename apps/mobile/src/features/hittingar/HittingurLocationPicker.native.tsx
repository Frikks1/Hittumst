import { Text } from '@/components/Typography';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';
import { useApp } from '@/providers/AppProvider';
import type { GeoCoordinate } from '@/types/domain';
import { hittingarFeature } from './config';
import { MapAttribution } from './components';
import { ICELAND_BOUNDS } from './model';

export type HittingurLocationPickerProps = {
  value: GeoCoordinate | null;
  onChange: (value: GeoCoordinate) => void;
};

export default function HittingurLocationPicker({ value, onChange }: HittingurLocationPickerProps) {
  const { t, theme } = useApp();
  if (!hittingarFeature.mapStyleUrl) {
    return <View style={[styles.fallback, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={{ color: theme.colors.textMuted }}>{t('hittingar.create.pinMapUnavailable')}</Text></View>;
  }
  const point: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: 'FeatureCollection',
    features: value ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [value.longitude, value.latitude] }, properties: {} }] : [],
  };
  return (
    <View style={styles.root} accessibilityLabel={t('hittingar.create.pinMapLabel')}>
      <Map
        mapStyle={hittingarFeature.mapStyleUrl}
        style={StyleSheet.absoluteFill}
        touchRotate={false}
        touchPitch={false}
        attribution={false}
        logo={false}
        onPress={(event) => {
          const [longitude, latitude] = event.nativeEvent.lngLat;
          onChange({ latitude, longitude });
        }}
      >
        <Camera
          minZoom={3.5}
          maxZoom={18}
          initialViewState={value
            ? { center: [value.longitude, value.latitude], zoom: 13 }
            : { bounds: [...ICELAND_BOUNDS], padding: { top: 18, right: 18, bottom: 18, left: 18 } }}
        />
        <GeoJSONSource id="selected-location" data={point}>
          <Layer id="selected-location-point" type="circle" paint={{ 'circle-color': theme.colors.danger, 'circle-radius': 9, 'circle-stroke-width': 3, 'circle-stroke-color': theme.colors.surfaceRaised }} />
        </GeoJSONSource>
      </Map>
      <View style={styles.attribution}><MapAttribution /></View>
      <View pointerEvents="none" style={[styles.hint, { backgroundColor: theme.colors.surfaceRaised }]}><Text style={[styles.hintText, { color: theme.colors.text }]}>{t('hittingar.create.pinHint')}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 240, borderRadius: 18, overflow: 'hidden' },
  fallback: { height: 160, borderRadius: 18, padding: 20, alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 10, padding: 8 },
  attribution: { position: 'absolute', left: 8, top: 8 },
  hintText: { fontSize: 11, lineHeight: 15, textAlign: 'center', fontWeight: '700' },
});
