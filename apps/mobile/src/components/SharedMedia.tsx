import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

function SharedVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', height: 230, borderRadius: 14 }} />;
}
export default function SharedMedia({ uri, kind }: { uri: string; kind: 'image' | 'video' }) {
  return kind === 'video' ? <SharedVideo uri={uri} /> : <Image source={uri} cachePolicy="memory" contentFit="contain" accessibilityLabel="Shared photo" style={{ width: '100%', height: 230, borderRadius: 14 }} />;
}
