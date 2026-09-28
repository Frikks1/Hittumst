import { Text } from '@/components/Typography';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapInstance, MapMouseEvent } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
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

const ICELAND_FIT: [[number, number], [number, number]] = [
  [ICELAND_BOUNDS[0], ICELAND_BOUNDS[1]],
  [ICELAND_BOUNDS[2], ICELAND_BOUNDS[3]],
];

export default function HittingurLocationPicker({ value, onChange }: HittingurLocationPickerProps) {
  const { t, theme } = useApp();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapInstance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!container.current || !hittingarFeature.mapStyleUrl) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: hittingarFeature.mapStyleUrl,
      bounds: ICELAND_FIT,
      fitBoundsOptions: { padding: 18 },
      minZoom: 3.5,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.current = instance;
    instance.on('load', () => {
      instance.addSource('selected-location', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      instance.addLayer({
        id: 'selected-location-point',
        type: 'circle',
        source: 'selected-location',
        paint: { 'circle-color': theme.colors.danger, 'circle-radius': 9, 'circle-stroke-width': 3, 'circle-stroke-color': theme.colors.surfaceRaised },
      });
    });
    instance.on('click', (event: MapMouseEvent) => onChangeRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }));
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.current = null; instance.remove(); };
  }, [theme.colors.danger, theme.colors.surfaceRaised]);

  useEffect(() => {
    const source = map.current?.getSource('selected-location') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: value ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [value.longitude, value.latitude] }, properties: {} }] : [],
    });
    if (value) map.current?.easeTo({ center: [value.longitude, value.latitude], zoom: Math.max(map.current.getZoom(), 12), duration: 300 });
  }, [value]);

  if (!hittingarFeature.mapStyleUrl) {
    return <View style={[styles.fallback, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={{ color: theme.colors.textMuted }}>{t('hittingar.create.pinMapUnavailable')}</Text></View>;
  }
  return (
    <View style={styles.root} accessibilityLabel={t('hittingar.create.pinMapLabel')}>
      <div ref={container} style={webStyles.map} />
      <View style={styles.attribution}><MapAttribution /></View>
      <View pointerEvents="none" style={[styles.hint, { backgroundColor: theme.colors.surfaceRaised }]}><Text style={[styles.hintText, { color: theme.colors.text }]}>{t('hittingar.create.pinHint')}</Text></View>
    </View>
  );
}

const webStyles = { map: { position: 'absolute', inset: 0 } } as const;
const styles = StyleSheet.create({
  root: { height: 240, borderRadius: 18, overflow: 'hidden', position: 'relative' },
  fallback: { height: 160, borderRadius: 18, padding: 20, alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 10, padding: 8 },
  attribution: { position: 'absolute', left: 8, top: 8 },
  hintText: { fontSize: 11, lineHeight: 15, textAlign: 'center', fontWeight: '700' },
});
