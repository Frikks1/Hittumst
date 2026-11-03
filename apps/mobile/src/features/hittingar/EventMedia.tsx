import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from 'expo-router';
import type { MeetupMedia } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { MeetupMediaUpload } from '@/services/types';
import { communityApi } from '@/services/community';
import { appendCreationPhotos, MAX_CREATION_PHOTOS, MAX_EVENT_MEDIA_BYTES, pendingCreationUploads, type PendingEventMedia } from './pendingEventPhotos';

export type { PendingEventMedia } from './pendingEventPhotos';
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
export function EventMediaGallery({ id, editable = false, pending = [], onPendingChange, creationPhotos = false, disabled = false }: {
  id?: string | null;
  editable?: boolean;
  pending?: PendingEventMedia[];
  onPendingChange?: (items: PendingEventMedia[]) => void;
  creationPhotos?: boolean;
  disabled?: boolean;
}) {
  const { t, theme, locale } = useApp();
  const [items, setItems] = useState<MeetupMedia[]>([]); const [coverId, setCoverId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<MeetupMediaUpload[]>([]);
  const [countsLoadedFor, setCountsLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  const waitingUploads = creationPhotos ? pendingCreationUploads(items.map(item => item.id), uploads) : [];
  const savedCount = items.length + waitingUploads.length;
  const countsReady = !creationPhotos || !editable || !id || countsLoadedFor === id;
  const latest = useRef({ id, disabled, pending, savedCount, coverId, countsReady });
  latest.current = { id, disabled, pending, savedCount, coverId, countsReady };
  const mediaLimit = creationPhotos ? MAX_CREATION_PHOTOS : 8;
  const mutationsDisabled = disabled || busy;
  const readGallery = useCallback(async () => {
    if (!id) return null;
    // Receipts precede approved media so approval during these reads cannot free a slot accidentally.
    const receipts = creationPhotos && editable ? await api.listMeetupMediaUploads(id) : [];
    const [media, community] = await Promise.all([api.listMeetupMedia(id), editable ? communityApi.getState(id) : Promise.resolve(null)]);
    return { media, community, receipts };
  }, [id, editable, creationPhotos]);
  const load = useCallback(async () => {
    const gallery = await readGallery();
    if (!gallery || latest.current.id !== id) return;
    setItems(gallery.media); setUploads(gallery.receipts);
    if (gallery.community) setCoverId(gallery.community.coverMediaId ?? gallery.community.cover?.id ?? null);
    if (creationPhotos && id) {
      setCountsLoadedFor(id);
      latest.current = { ...latest.current, countsReady: true, savedCount: gallery.media.length + pendingCreationUploads(gallery.media.map(item => item.id), gallery.receipts).length };
    }
  }, [id, creationPhotos, readGallery]);
  useEffect(() => { setItems([]); setCoverId(null); setUploads([]); setCountsLoadedFor(null); }, [id, creationPhotos, editable]);
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = () => {
      if (id) void readGallery().then(gallery => {
        if (active && gallery) {
          setItems(gallery.media); setUploads(gallery.receipts);
          if (gallery.community) setCoverId(gallery.community.coverMediaId ?? gallery.community.cover?.id ?? null);
          if (creationPhotos) setCountsLoadedFor(id);
          setError(false);
        }
      }).catch(() => { if (active) { setError(true); if (creationPhotos) setCountsLoadedFor(null); } });
    };
    refresh(); const timer = setInterval(refresh, 240_000);
    return () => { active = false; clearInterval(timer); };
  }, [id, creationPhotos, readGallery]));
  const pick = async () => {
    if (mutationsDisabled || !countsReady || savedCount + pending.length >= mediaLimit) return;
    setBusy(true); setError(false);
    try {
      if (creationPhotos && id) await load();
      if (latest.current.id !== id || !latest.current.countsReady || latest.current.savedCount + latest.current.pending.length >= mediaLimit) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: creationPhotos ? ['images'] : ['images', 'videos'],
        quality: 0.85,
        allowsMultipleSelection: creationPhotos,
        selectionLimit: creationPhotos ? Math.max(1, mediaLimit - latest.current.savedCount - latest.current.pending.length) : 1,
      });
      if (result.canceled || latest.current.disabled || latest.current.id !== id || !latest.current.countsReady) return;
      if (creationPhotos) {
        const next = appendCreationPhotos(latest.current.pending, latest.current.savedCount, result.assets, !!latest.current.coverId);
        if (onPendingChange) onPendingChange(next);
        else if (id) {
          for (const media of next.slice(latest.current.pending.length)) {
            await api.uploadMeetupMedia(id, media.uri, media.kind, media.mimeType);
          }
          await load();
        }
        return;
      }
      const asset = result.assets[0]; if (!asset) return;
      if ((asset.fileSize ?? 0) > MAX_EVENT_MEDIA_BYTES) throw new Error('media_size');
      const kind = asset.type === 'video' ? 'video' as const : 'photo' as const;
      const media = { uri: asset.uri, kind, mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg') };
      if (onPendingChange) onPendingChange([...pending, media]);
      else if (id) { await api.uploadMeetupMedia(id, media.uri, media.kind, media.mimeType); await load(); }
    } catch { setError(true); } finally { setBusy(false); }
  };
  const chooseCover = async (mediaId: string | null) => {
    if (!id || mutationsDisabled) return; setBusy(true); setError(false);
    try {
      await communityApi.setCover(id, mediaId);
      setCoverId(mediaId);
      if (!latest.current.disabled) onPendingChange?.(latest.current.pending.map(item => ({ ...item, isCover: false })));
    }
    catch { setError(true); } finally { setBusy(false); }
  };
  const choosePendingCover = (index: number) => {
    if (mutationsDisabled) return;
    onPendingChange?.(pending.map((media, i) => ({ ...media, isCover: i === index && !pending[index]?.isCover })));
  };
  const removePending = (index: number) => {
    if (mutationsDisabled) return;
    onPendingChange?.(pending.filter((_, i) => i !== index));
  };
  const removeSaved = (mediaId: string) => {
    if (!id || mutationsDisabled) return;
    setBusy(true);
    void api.removeMeetupMedia(id, mediaId).then(load).catch(() => setError(true)).finally(() => setBusy(false));
  };
  if (!editable && !items.length && !error) return null;
  if (creationPhotos) {
    const count = savedCount + pending.length;
    const coverLabel = (selected: boolean) => locale === 'is'
      ? (selected ? 'Forsíðumynd' : 'Nota á forsíðu')
      : (selected ? 'Cover selected' : 'Use as cover');
    const thumbnail = (key: string, uri: string, selected: boolean, choose: () => void, remove: () => void) => (
      <View key={key} style={{ width: 108, gap: 7 }}>
        <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.border }}>
          <Image source={{ uri }} accessibilityLabel={locale === 'is' ? 'Mynd af hittingi' : 'Event photo'} style={{ width: 106, height: 106 }} resizeMode="cover" />
          {editable && <Pressable
            accessibilityRole="button"
            accessibilityLabel={locale === 'is' ? 'Fjarlægja mynd' : 'Remove photo'}
            accessibilityState={{ disabled: mutationsDisabled }}
            disabled={mutationsDisabled}
            onPress={remove}
            style={{ position: 'absolute', top: 5, right: 5, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, opacity: mutationsDisabled ? 0.5 : 0.95 }}
          ><Ionicons name="close" size={19} color={theme.colors.text} /></Pressable>}
        </View>
        {editable && <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={coverLabel(selected)}
          accessibilityState={{ checked: selected, disabled: mutationsDisabled }}
          disabled={mutationsDisabled}
          onPress={choose}
          style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: mutationsDisabled ? 0.5 : 1 }}
        >
          {selected && <Ionicons name="checkmark-circle" size={14} color={theme.colors.accent} />}
          <Text style={{ color: selected ? theme.colors.accent : theme.colors.textMuted, fontSize: 11, fontWeight: '700' }}>{coverLabel(selected)}</Text>
        </Pressable>}
      </View>
    );
    return <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{locale === 'is' ? 'Allt að 3 myndir' : 'Up to 3 photos'}</Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' }}>{countsReady ? count : '…'}/{MAX_CREATION_PHOTOS}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {items.map(item => thumbnail(item.id, item.url, coverId === item.id && !pending.some(x => x.isCover), () => void chooseCover(coverId === item.id ? null : item.id), () => removeSaved(item.id)))}
        {waitingUploads.map(upload => <View key={upload.id} style={{ width: 108, gap: 7 }}>
          <View style={{ width: 108, height: 108, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="hourglass-outline" size={26} color={theme.colors.textMuted} />
          </View>
          <Text style={{ color: theme.colors.textMuted, fontSize: 11, textAlign: 'center' }}>{locale === 'is' ? 'Bíður yfirferðar' : 'Awaiting review'}</Text>
        </View>)}
        {pending.map((item, index) => thumbnail(`${item.uri}-${index}`, item.uri, !!item.isCover, () => choosePendingCover(index), () => removePending(index)))}
        {editable && count < MAX_CREATION_PHOTOS && <Pressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'is' ? 'Bæta við myndum' : 'Add photos'}
          accessibilityState={{ disabled: mutationsDisabled || !countsReady, busy }}
          disabled={mutationsDisabled || !countsReady}
          onPress={() => void pick()}
          style={{ width: 108, height: 108, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: mutationsDisabled || !countsReady ? 0.5 : 1 }}
        >
          <Ionicons name="images-outline" size={26} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700' }}>{locale === 'is' ? 'Bæta við' : 'Add photos'}</Text>
        </Pressable>}
      </ScrollView>
      {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('event.mediaError')}</Text>}
      {id && !countsReady && error && <Button label={t('common.retry')} variant="ghost" disabled={disabled || busy} onPress={() => {
        setBusy(true);
        void load().then(() => setError(false)).catch(() => setError(true)).finally(() => setBusy(false));
      }} />}
    </View>;
  }
  return <View style={{ gap: 12 }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('event.media')}</Text>
    {editable && <><Text style={{ color: theme.colors.textMuted, lineHeight: 20 }}>{t('event.mediaHint')}</Text><Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Veldu valfrjálsa forsíðumynd. Efnið birtist eftir samþykki; persónulegar komuupplýsingar eiga ekki heima á forsíðunni.' : 'Choose an optional cover. Media appears after approval; keep private arrival details out of covers.'}</Text></>}
    {items.map(item => <View key={item.id} style={{ gap: 8 }}>
      <EventMediaPreview uri={item.url} kind={item.kind} />
      {editable && <>
        <ChoiceChip label={locale === 'is' ? (coverId === item.id && !pending.some(x => x.isCover) ? 'Forsíðumynd' : 'Nota á forsíðu') : (coverId === item.id && !pending.some(x => x.isCover) ? 'Cover selected' : 'Use as cover')} selected={coverId === item.id && !pending.some(x => x.isCover)} onPress={() => void chooseCover(coverId === item.id ? null : item.id)} />
        <Button label={t('event.remove')} disabled={mutationsDisabled} variant="ghost" onPress={() => removeSaved(item.id)} />
      </>}
    </View>)}
    {pending.map((item, index) => <View key={`${item.uri}-${index}`} style={{ gap: 8 }}>
      <EventMediaPreview uri={item.uri} kind={item.kind} />
      <ChoiceChip label={locale === 'is' ? (item.isCover ? 'Forsíðumynd' : 'Nota á forsíðu') : (item.isCover ? 'Cover selected' : 'Use as cover')} selected={!!item.isCover} onPress={() => choosePendingCover(index)} />
      <Button label={t('event.remove')} disabled={mutationsDisabled} variant="ghost" onPress={() => removePending(index)} />
    </View>)}
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('event.mediaError')}</Text>}
    {editable && <Button label={t('event.addMedia')} icon="images-outline" variant="secondary" disabled={disabled || items.length + pending.length >= mediaLimit} loading={busy} onPress={() => void pick()} />}
  </View>;
}
