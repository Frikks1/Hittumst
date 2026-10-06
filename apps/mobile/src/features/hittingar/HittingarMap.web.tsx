import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapInstance, MapLayerMouseEvent } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '@/providers/AppProvider';
import { hittingarFeature } from './config';
import { MapAttribution, MapUnavailable } from './components';
import { ICELAND_BOUNDS, toMeetupFeatureCollection, type HittingurListModel } from './model';

export type HittingarMapProps = {
  items: HittingurListModel[];
  onSelect: (id: string) => void;
};

const ICELAND_FIT: [[number, number], [number, number]] = [
  [ICELAND_BOUNDS[0], ICELAND_BOUNDS[1]],
  [ICELAND_BOUNDS[2], ICELAND_BOUNDS[3]],
];

export default function HittingarMap({ items, onSelect }: HittingarMapProps) {
  const { t, theme } = useApp();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapInstance | null>(null);
  const onSelectRef = useRef(onSelect);
  const data = useMemo(() => toMeetupFeatureCollection(items), [items]);
  const dataRef = useRef(data);
  const [ready, setReady] = useState(false);

  onSelectRef.current = onSelect;
  dataRef.current = data;

  useEffect(() => {
    if (!container.current || !hittingarFeature.mapStyleUrl) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: hittingarFeature.mapStyleUrl,
      bounds: ICELAND_FIT,
      fitBoundsOptions: { padding: 52 },
      minZoom: 3.5,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.current = instance;

    instance.on('load', () => {
      instance.addSource('hittingar', {
        type: 'geojson',
        data: dataRef.current,
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 58,
      });
      instance.addLayer({
        id: 'hittingar-clusters',
        type: 'circle',
        source: 'hittingar',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': theme.colors.accent,
          'circle-radius': ['step', ['get', 'point_count'], 20, 10, 25, 30, 31],
          'circle-stroke-width': 3,
          'circle-stroke-color': theme.colors.surfaceRaised,
        },
      });
      instance.addLayer({
        id: 'hittingar-cluster-count',
        type: 'symbol',
        source: 'hittingar',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13 },
        paint: { 'text-color': theme.colors.textOnAccent },
      });
      instance.addLayer({
        id: 'hittingar-markers',
        type: 'circle',
        source: 'hittingar',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['get', 'explicit'], theme.colors.lava, theme.colors.accent],
          'circle-radius': 10,
          'circle-stroke-width': ['case', ['get', 'approximate'], 4, 2],
          'circle-stroke-color': theme.colors.surfaceRaised,
          'circle-opacity': ['case', ['get', 'approximate'], 0.78, 1],
        },
      });
      setReady(true);
    });

    instance.on('click', 'hittingar-markers', (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const id = feature?.properties?.id;
      if (typeof id === 'string') onSelectRef.current(id);
    });
    instance.on('click', 'hittingar-clusters', (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      if (!feature || feature.geometry.type !== 'Point' || typeof clusterId !== 'number') return;
      const coordinates = feature.geometry.coordinates;
      if (coordinates.length < 2) return;
      const source = instance.getSource('hittingar') as GeoJSONSource | undefined;
      void source?.getClusterExpansionZoom(clusterId).then((zoom) => {
        instance.easeTo({ center: [Number(coordinates[0]), Number(coordinates[1])], zoom, duration: 350 });
      });
    });
    for (const layer of ['hittingar-clusters', 'hittingar-markers']) {
      instance.on('mouseenter', layer, () => { instance.getCanvas().style.cursor = 'pointer'; });
      instance.on('mouseleave', layer, () => { instance.getCanvas().style.cursor = ''; });
    }

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      setReady(false);
      map.current = null;
      instance.remove();
    };
  }, [theme.colors.accent, theme.colors.lava, theme.colors.surfaceRaised, theme.colors.textOnAccent]);

  useEffect(() => {
    if (!ready) return;
    const source = map.current?.getSource('hittingar') as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data, ready]);

  if (!hittingarFeature.mapStyleUrl) {
    return <MapUnavailable items={items} onSelect={onSelect} providerMissing />;
  }

  const reset = () => map.current?.fitBounds(ICELAND_FIT, { padding: 52, duration: 450 });
  return (
    <View style={styles.root} accessibilityLabel={t('hittingar.map.accessibilityLabel')}>
      <div ref={container} style={webStyles.map} />
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.map.zoomIn')} onPress={() => map.current?.zoomIn({ duration: 180 })} style={[styles.control, { backgroundColor: theme.colors.surfaceRaised }]}>
          <Ionicons name="add" size={22} color={theme.colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.map.zoomOut')} onPress={() => map.current?.zoomOut({ duration: 180 })} style={[styles.control, { backgroundColor: theme.colors.surfaceRaised }]}>
          <Ionicons name="remove" size={22} color={theme.colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.map.showIceland')} onPress={reset} style={[styles.control, styles.reset, { backgroundColor: theme.colors.surfaceRaised }]}>
          <Ionicons name="earth-outline" size={20} color={theme.colors.text} />
          <Text style={[styles.resetText, { color: theme.colors.text }]}>{t('hittingar.map.iceland')}</Text>
        </Pressable>
      </View>
      <View style={styles.attribution}><MapAttribution /></View>
    </View>
  );
}

const webStyles = { map: { position: 'absolute', inset: 0 } } as const;

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 220, overflow: 'hidden', position: 'relative' },
  controls: { position: 'absolute', right: 12, top: 12, alignItems: 'flex-end', gap: 8 },
  control: { minWidth: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.17, shadowRadius: 10 },
  reset: { paddingHorizontal: 11, flexDirection: 'row', gap: 6 },
  resetText: { fontSize: 11, fontWeight: '800' },
  attribution: { position: 'absolute', left: 8, bottom: 8 },
});
