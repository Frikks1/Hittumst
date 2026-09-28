import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from 'expo-router';
import type { CommunityCover } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';

function CoverVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, instance => { instance.play(); });
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', height: 230, borderRadius: 16 }} />;
}

/** A discovery cover never starts a video or exposes media still awaiting approval. */
export function EventCover({ cover, title, compact = false, playable = false }: {
  cover?: CommunityCover | null; title: string; compact?: boolean; playable?: boolean;
}) {
  const { theme, locale } = useApp();
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setFailed(false); setPlaying(false); }, [cover?.id, cover?.url, cover?.posterUrl]);
  useFocusEffect(useCallback(() => () => setPlaying(false), []));
  const uri = cover?.kind === 'video' ? cover.posterUrl : cover?.url;
  const canPlay = playable && cover?.kind === 'video' && !!cover.url;
  if (playing && cover?.url) return <CoverVideo uri={cover.url} />;
  const visual = <View style={{ minHeight: compact ? 138 : 210, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.colors.accentSoft, alignItems: 'center', justifyContent: 'center', padding: uri && !failed ? 0 : 22, gap: 9 }}>
    {uri && !failed ? <Image source={{ uri }} accessibilityLabel={title} onError={() => setFailed(true)} style={{ width: '100%', height: compact ? 138 : 210 }} resizeMode="cover" /> : <>
      <Ionicons name={cover?.kind === 'video' ? 'videocam-outline' : 'people-outline'} size={compact ? 32 : 46} color={theme.colors.accent} />
      <Text numberOfLines={2} style={{ color: theme.colors.text, fontWeight: '800', textAlign: 'center', fontSize: compact ? 15 : 20 }}>{title}</Text>
    </>}
    {cover?.kind === 'video' && <View style={{ position: 'absolute', bottom: 12, right: 12, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(0,0,0,.7)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name="play-circle" size={22} color="white" /><Text style={{ color: 'white', fontWeight: '700' }}>{locale === 'is' ? 'Myndskeið' : 'Video'}</Text>
    </View>}
  </View>;
  return canPlay ? <Pressable accessibilityRole="button" accessibilityLabel={locale === 'is' ? 'Spila myndskeið' : 'Play event video'} onPress={() => setPlaying(true)}>{visual}</Pressable> : visual;
}
