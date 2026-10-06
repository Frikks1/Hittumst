import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { Camera, type CameraRef, GeoJSONSource, type GeoJSONSourceRef, Layer, Map } from '@maplibre/maplibre-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '@/providers/AppProvider';
import { hittingarFeature } from './config';
import { MapAttribution, MapUnavailable } from './components';
import { ICELAND_BOUNDS, toMeetupFeatureCollection, type HittingurListModel } from './model';

export type HittingarMapProps = {
  items: HittingurListModel[];
  onSelect: (id: string) => void;
};

export default function HittingarMap({ items, onSelect }: HittingarMapProps) {
  const { t, theme } = useApp();
  const camera = useRef<CameraRef>(null);
  const source = useRef<GeoJSONSourceRef>(null);
  const [zoom, setZoom] = useState(4.8);
  const data = useMemo(() => toMeetupFeatureCollection(items), [items]);

  if (!hittingarFeature.mapStyleUrl) {
    return <MapUnavailable items={items} onSelect={onSelect} providerMissing />;
  }

  const reset = () => camera.current?.fitBounds(
    [...ICELAND_BOUNDS],
    { padding: { top: 48, right: 28, bottom: 180, left: 28 }, duration: 450 },
  );

  return (
    <View style={styles.root} accessibilityLabel={t('hittingar.map.accessibilityLabel')}>
      <Map
        mapStyle={hittingarFeature.mapStyleUrl}
        style={StyleSheet.absoluteFill}
        dragPan
        touchZoom
        doubleTapZoom
        touchRotate={false}
        touchPitch={false}
        attribution
        logo
        compass
        scaleBar
        attributionPosition={{ bottom: 36, left: 8 }}
        logoPosition={{ bottom: 36, right: 8 }}
        onRegionDidChange={(event) => setZoom(event.nativeEvent.zoom)}
      >
        <Camera
          ref={camera}
          minZoom={3.5}
          maxZoom={18}
          initialViewState={{
            bounds: [...ICELAND_BOUNDS],
            padding: { top: 48, right: 28, bottom: 180, left: 28 },
          }}
        />
        <GeoJSONSource
          ref={source}
          id="hittingar"
          data={data}
          cluster
          clusterRadius={58}
          clusterMaxZoom={11}
          onPress={(event) => {
            event.stopPropagation();
            const feature = event.nativeEvent.features[0];
            if (!feature) return;
            const properties = feature.properties ?? {};
            if (properties.cluster && typeof properties.cluster_id === 'number' && feature.geometry.type === 'Point') {
              const coordinates = feature.geometry.coordinates;
              if (coordinates.length < 2) return;
              const center: [number, number] = [Number(coordinates[0]), Number(coordinates[1])];
              void source.current?.getClusterExpansionZoom(properties.cluster_id).then((nextZoom) => {
                camera.current?.flyTo({ center, zoom: nextZoom, duration: 350 });
              });
              return;
            }
            const id = typeof properties.id === 'string' ? properties.id : String(feature.id ?? '');
            if (id) onSelect(id);
          }}
        >
          <Layer
            id="hittingar-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': theme.colors.accent,
              'circle-radius': ['step', ['get', 'point_count'], 20, 10, 25, 30, 31],
              'circle-stroke-width': 3,
              'circle-stroke-color': theme.colors.surfaceRaised,
            }}
          />
          <Layer
            id="hittingar-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13 }}
            paint={{ 'text-color': theme.colors.textOnAccent }}
          />
          <Layer
            id="hittingar-markers"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': ['case', ['get', 'explicit'], theme.colors.lava, theme.colors.accent],
              'circle-radius': 10,
              'circle-stroke-width': ['case', ['get', 'approximate'], 4, 2],
              'circle-stroke-color': theme.colors.surfaceRaised,
              'circle-opacity': ['case', ['get', 'approximate'], 0.78, 1],
            }}
          />
        </GeoJSONSource>
      </Map>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.map.zoomIn')} onPress={() => camera.current?.zoomTo(Math.min(zoom + 1, 18), { duration: 180 })} style={[styles.control, { backgroundColor: theme.colors.surfaceRaised }]}>
          <Ionicons name="add" size={22} color={theme.colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.map.zoomOut')} onPress={() => camera.current?.zoomTo(Math.max(zoom - 1, 3.5), { duration: 180 })} style={[styles.control, { backgroundColor: theme.colors.surfaceRaised }]}>
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

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 220, overflow: 'hidden' },
  controls: { position: 'absolute', right: 12, top: 12, alignItems: 'flex-end', gap: 8 },
  control: { minWidth: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.17, shadowRadius: 10, elevation: 5 },
  reset: { paddingHorizontal: 11, flexDirection: 'row', gap: 6 },
  resetText: { fontSize: 11, fontWeight: '800' },
  attribution: { position: 'absolute', left: 8, bottom: 8 },
});
