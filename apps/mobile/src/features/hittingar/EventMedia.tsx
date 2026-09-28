import { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from 'expo-router';
import type { MeetupMedia } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { communityApi } from '@/services/community';

export type PendingEventMedia = { uri: string; kind: 'photo' | 'video'; mimeType: string; isCover?: boolean };
function EventVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  return <VideoView player={player} nativeControls style={{ width: '100%', height: 240, borderRadius: 16 }} />;
}
export function EventMediaPreview({ uri, kind }: { uri: string; kind: 'photo' | 'video' }) {
  const { locale, theme } = useApp(); const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (failed) return <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Myndin er ekki tiltæk.' : 'This image is unavailable.'}</Text>;
  return kind === 'video' ? <EventVideo uri={uri} /> : <Image accessibilityLabel={locale === 'is' ? 'Mynd af hittingi' : 'Event photo'} source={{ uri }} onError={() => setFailed(true)} style={{ width: '100%', height: 240, borderRadius: 16 }} resizeMode="cover" />;
}
export function EventMediaGallery({ id, editable = false, pending = [], onPendingChange }: { id?: string | null; editable?: boolean; pending?: PendingEventMedia[]; onPendingChange?: (items: PendingEventMedia[]) => void }) {
  const { t, theme, locale } = useApp();
  const [items, setItems] = useState<MeetupMedia[]>([]); const [coverId, setCoverId] = useState<string | null>(null);
  const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!id) return;
    const [media, community] = await Promise.all([api.listMeetupMedia(id), editable ? communityApi.getState(id) : Promise.resolve(null)]);
    setItems(media); if (community) setCoverId(community.coverMediaId ?? community.cover?.id ?? null);
  }, [id, editable]);
  useEffect(() => { setItems([]); setCoverId(null); }, [id]);
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = () => {
      if (id) void Promise.all([api.listMeetupMedia(id), editable ? communityApi.getState(id) : Promise.resolve(null)]).then(([media, community]) => {
        if (active) { setItems(media); if (community) setCoverId(community.coverMediaId ?? community.cover?.id ?? null); }
      }).catch(() => { if (active) setError(true); });
    };
    refresh(); const timer = setInterval(refresh, 240_000);
    return () => { active = false; clearInterval(timer); };
  }, [id, editable]));
  const pick = async () => {
    setBusy(true); setError(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
      if (result.canceled) return;
      const asset = result.assets[0]; if (!asset) return;
      if ((asset.fileSize ?? 0) > 50 * 1024 * 1024) throw new Error('media_size');
      const kind = asset.type === 'video' ? 'video' as const : 'photo' as const;
      const media = { uri: asset.uri, kind, mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg') };
      if (onPendingChange) onPendingChange([...pending, media]);
      else if (id) { await api.uploadMeetupMedia(id, media.uri, media.kind, media.mimeType); await load(); }
    } catch { setError(true); } finally { setBusy(false); }
  };
  const chooseCover = async (mediaId: string | null) => {
    if (!id || busy) return; setBusy(true); setError(false);
    try { await communityApi.setCover(id, mediaId); setCoverId(mediaId); onPendingChange?.(pending.map(item => ({ ...item, isCover: false }))); }
    catch { setError(true); } finally { setBusy(false); }
  };
  if (!editable && !items.length && !error) return null;
  return <View style={{ gap: 12 }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('event.media')}</Text>
    {editable && <><Text style={{ color: theme.colors.textMuted, lineHeight: 20 }}>{t('event.mediaHint')}</Text><Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Veldu valfrjálsa forsíðumynd. Efnið birtist eftir samþykki; persónulegar komuupplýsingar eiga ekki heima á forsíðunni.' : 'Choose an optional cover. Media appears after approval; keep private arrival details out of covers.'}</Text></>}
    {items.map(item => <View key={item.id} style={{ gap: 8 }}>
      <EventMediaPreview uri={item.url} kind={item.kind} />
      {editable && <>
        <ChoiceChip label={locale === 'is' ? (coverId === item.id && !pending.some(x => x.isCover) ? 'Forsíðumynd' : 'Nota á forsíðu') : (coverId === item.id && !pending.some(x => x.isCover) ? 'Cover selected' : 'Use as cover')} selected={coverId === item.id && !pending.some(x => x.isCover)} onPress={() => void chooseCover(coverId === item.id ? null : item.id)} />
        <Button label={t('event.remove')} disabled={busy} variant="ghost" onPress={() => { setBusy(true); void api.removeMeetupMedia(id!, item.id).then(load).catch(() => setError(true)).finally(() => setBusy(false)); }} />
      </>}
    </View>)}
    {pending.map((item, index) => <View key={`${item.uri}-${index}`} style={{ gap: 8 }}>
      <EventMediaPreview uri={item.uri} kind={item.kind} />
      <ChoiceChip label={locale === 'is' ? (item.isCover ? 'Forsíðumynd' : 'Nota á forsíðu') : (item.isCover ? 'Cover selected' : 'Use as cover')} selected={!!item.isCover} onPress={() => onPendingChange?.(pending.map((media, i) => ({ ...media, isCover: i === index && !item.isCover })))} />
      <Button label={t('event.remove')} variant="ghost" onPress={() => onPendingChange?.(pending.filter((_, i) => i !== index))} />
    </View>)}
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('event.mediaError')}</Text>}
    {editable && <Button label={t('event.addMedia')} icon="images-outline" variant="secondary" disabled={items.length + pending.length >= 8} loading={busy} onPress={() => void pick()} />}
  </View>;
}
