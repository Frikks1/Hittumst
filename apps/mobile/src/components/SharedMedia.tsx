import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppState } from 'react-native';

function SharedVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(null);
  const focused = useRef(false);
  const source = useRef('');
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; player.pause(); };
  }, [player]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') player.pause(); });
    return () => subscription.remove();
  }, [player]);
  useEffect(() => {
    let active = true;
    const identity = uri.split('?')[0] ?? uri;
    const sameMedia = source.current === identity;
    const time = sameMedia ? player.currentTime : 0;
    const playing = sameMedia && player.playing;
    source.current = identity;
    // Gallery polling renews signed URLs. Keep the position of an in-progress
    // clip instead of recreating its player and restarting it every 30 seconds.
    void player.replaceAsync(uri).then(() => {
      if (!active) return;
      player.currentTime = time;
      if (playing && focused.current && AppState.currentState === 'active') player.play();
    }).catch(() => { /* A later signed-URL refresh retries unavailable media. */ });
    return () => { active = false; };
  }, [player, uri]);
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', height: 230, borderRadius: 14 }} />;
}
export default function SharedMedia({ uri, kind }: { uri: string; kind: 'image' | 'video' }) {
  return kind === 'video' ? <SharedVideo uri={uri} /> : <Image source={uri} cachePolicy="memory" contentFit="contain" accessibilityLabel="Shared photo" style={{ width: '100%', height: 230, borderRadius: 14 }} />;
}
