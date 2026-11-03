import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Showcase, ShowcaseEntry, ShowcaseMedia } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { showcaseApi } from '@/services/showcases';
import { showcaseCopy } from './copy';
import { showcaseAlbumRoute } from './model';

export const showcaseStyles = StyleSheet.create({
  page: { padding: 18, gap: 16 },
  section: { gap: 12 },
  panel: { padding: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flex: { flex: 1, minWidth: 140 },
  label: { fontSize: 14, fontWeight: '800' },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  galleryItem: { flexBasis: 260, flexGrow: 1, minWidth: 0 },
  media: { width: '100%', height: 220, borderRadius: 16, backgroundColor: '#101818' },
  cover: { width: '100%', height: 170, borderRadius: 16 },
  entry: { gap: 12 },
});

export function ShowcasePanel({ children }: { children: ReactNode }) {
  const { theme } = useApp();
  return (
    <View
      style={[
        showcaseStyles.panel,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      {children}
    </View>
  );
}
export function ShowcaseHint({
  children,
  alert = false,
}: {
  children: ReactNode;
  alert?: boolean;
}) {
  const { theme } = useApp();
  return (
    <Text
      accessibilityRole={alert ? 'alert' : undefined}
      style={[textStyles.caption, { color: alert ? theme.colors.danger : theme.colors.textMuted }]}
    >
      {children}
    </Text>
  );
}
export function ShowcaseHeading({ children }: { children: ReactNode }) {
  const { theme } = useApp();
  return (
    <Text accessibilityRole="header" style={[textStyles.heading, { color: theme.colors.text }]}>
      {children}
    </Text>
  );
}

/** Session generations prevent focus changes, backgrounding and account switches
 * from applying async results or displaying previously authorized media. */
export function useShowcaseSession(onResume: () => void, onSuspend?: () => void) {
  const { user } = useApp();
  const generation = useRef(0);
  const active = useRef(false);
  const resume = useRef(onResume);
  const suspend = useRef(onSuspend);
  resume.current = onResume;
  suspend.current = onSuspend;
  const [visible, setVisible] = useState(false);
  useFocusEffect(
    useCallback(() => {
      const start = () => {
        ++generation.current;
        active.current = true;
        setVisible(true);
        resume.current();
      };
      const stop = () => {
        ++generation.current;
        active.current = false;
        setVisible(false);
        suspend.current?.();
      };
      if (AppState.currentState === 'active') start();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') start();
        else stop();
      });
      return () => {
        subscription.remove();
        stop();
      };
    }, [user?.id]),
  );
  return {
    generation,
    active,
    visible,
    current: (request: number) => active.current && request === generation.current,
  };
}

function ShowcaseVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri, useCaching: false });
  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state !== 'active') player.pause();
      });
      return () => {
        subscription.remove();
        player.pause();
      };
    }, [player]),
  );
  return (
    <VideoView
      accessibilityLabel="Video"
      player={player}
      nativeControls
      contentFit="contain"
      style={showcaseStyles.media}
    />
  );
}
export function ShowcaseMediaView({ media }: { media: ShowcaseMedia }) {
  const { locale } = useApp();
  const c = showcaseCopy(locale);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [media.url]);
  if (media.status === 'pending') return <ShowcaseHint>{c.mediaPending}</ShowcaseHint>;
  if (media.status === 'rejected') return <ShowcaseHint alert>{c.mediaRejected}</ShowcaseHint>;
  if (!media.url || failed) return <ShowcaseHint>{c.mediaUnavailable}</ShowcaseHint>;
  return (
    <View style={showcaseStyles.section}>
      {media.kind === 'video' ? (
        <ShowcaseVideo uri={media.url} />
      ) : (
        <Image
          accessibilityLabel={media.caption || c.media}
          source={{ uri: media.url }}
          cachePolicy="none"
          onError={() => setFailed(true)}
          contentFit="cover"
          style={showcaseStyles.media}
        />
      )}
      {!!media.caption && <ShowcaseHint>{media.caption}</ShowcaseHint>}
    </View>
  );
}

export function ShowcaseEntryView({
  entry,
  owner = false,
  onReport,
}: {
  entry: ShowcaseEntry;
  owner?: boolean;
  onReport?: () => void;
}) {
  const { theme, locale } = useApp();
  const c = showcaseCopy(locale);
  const r = entry.requirements;
  const router = useRouter();
  return (
    <ShowcasePanel>
      {!!entry.title && <ShowcaseHeading>{entry.title}</ShowcaseHeading>}
      {owner && <ShowcaseHint>{c[entry.approvalStatus]}</ShowcaseHint>}
      {!!entry.groupName && <ShowcaseHint>{entry.groupName}</ShowcaseHint>}
      {!!entry.body && (
        <Text style={[textStyles.body, { color: theme.colors.text }]}>{entry.body}</Text>
      )}
      {entry.meetups.map((meetup) => (
        <View key={meetup.id} style={showcaseStyles.row}>
          <Ionicons name="calendar-outline" color={theme.colors.textMuted} size={16} />
          <Text style={{ color: theme.colors.text }}>{meetup.title}</Text>
        </View>
      ))}
      {entry.showCount && (
        <ShowcaseHint>
          {entry.verifiedCount === null
            ? c.countPending
            : `${entry.kind === 'person' ? c.sharedCount : c.count}: ${entry.verifiedCount}`}
        </ShowcaseHint>
      )}
      {entry.rating !== null && (
        <Text
          accessibilityLabel={`${c.personalRating}: ${entry.rating}/5`}
          style={{ color: theme.colors.accent, fontWeight: '800' }}
        >
          {'★'.repeat(entry.rating)}
          {'☆'.repeat(5 - entry.rating)} · {c.personalRating}
        </Text>
      )}
      {!!entry.review && entry.reviewIdentified && (
        <View style={showcaseStyles.section}>
          <ShowcaseHint>{c.review}</ShowcaseHint>
          <Text style={[textStyles.body, { color: theme.colors.text }]}>{entry.review}</Text>
        </View>
      )}
      {entry.albums.map((album) => {
        const route = showcaseAlbumRoute(album, owner);
        return route ? (
          <Button
            key={album.id}
            label={album.title}
            icon="images-outline"
            variant="secondary"
            onPress={() => router.push(route as Href)}
          />
        ) : null;
      })}
      {entry.showMembers && entry.groupMembers.length > 0 && (
        <View style={showcaseStyles.section}>
          <ShowcaseHeading>{c.members}</ShowcaseHeading>
          {entry.groupMembers.map((member) => (
            <Text key={member.id} style={{ color: theme.colors.text }}>
              {member.displayName}
            </Text>
          ))}
        </View>
      )}
      {entry.media.map((media) => (
        <ShowcaseMediaView key={media.id} media={media} />
      ))}
      {r && Object.values(r).some((value) => value !== undefined && value !== '') && (
        <View style={showcaseStyles.section}>
          <ShowcaseHeading>
            {c.requirements} {entry.groupName || entry.title}
          </ShowcaseHeading>
          <ShowcaseHint>{c.requirementsHint}</ShowcaseHint>
          {(r.minAge !== undefined || r.maxAge !== undefined) && (
            <ShowcaseHint>{`${c.minAge.split(' (')[0]}: ${r.minAge ?? '18'} · ${c.maxAge.split(' (')[0]}: ${r.maxAge ?? '—'}`}</ShowcaseHint>
          )}
          {!!r.memberType && <Text style={{ color: theme.colors.text }}>{r.memberType}</Text>}
          {!!r.text && <Text style={{ color: theme.colors.text }}>{r.text}</Text>}
          {!!r.meetupId && entry.requirementMeetups.find((meetup) => meetup.id === r.meetupId) && (
            <ShowcaseHint>
              {c.requiredMeetup}:{' '}
              {entry.requirementMeetups.find((meetup) => meetup.id === r.meetupId)!.title}
            </ShowcaseHint>
          )}
        </View>
      )}
      {onReport && (
        <Button label={c.reportEntry} icon="flag-outline" variant="ghost" onPress={onReport} />
      )}
    </ShowcasePanel>
  );
}

export function ShowcaseCard({ showcase, owner = false }: { showcase: Showcase; owner?: boolean }) {
  const { theme, locale } = useApp();
  const router = useRouter();
  const c = showcaseCopy(locale);
  const media = showcase.entries
    .flatMap((entry) => entry.media)
    .filter((item) => item.status !== 'pending' && item.status !== 'rejected');
  const cover =
    media.find((item) => item.id === showcase.coverMediaId) ??
    media.find((item) => item.kind === 'photo');
  const coverUri = cover?.kind === 'video' ? cover.posterUrl : cover?.url;
  const pending = showcase.entries.filter((entry) => entry.approvalStatus === 'pending').length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${showcase.title}, ${showcase.entries.length} ${c.entries}`}
      onPress={() => router.push(`/showcases/${showcase.id}` as Href)}
    >
      <ShowcasePanel>
        {coverUri ? (
          <Image
            accessibilityLabel={showcase.title}
            cachePolicy="none"
            source={{ uri: coverUri }}
            contentFit="cover"
            style={showcaseStyles.cover}
          />
        ) : (
          <Ionicons name="albums-outline" color={theme.colors.accent} size={30} />
        )}
        <ShowcaseHint>{c.templates[showcase.template]}</ShowcaseHint>
        <ShowcaseHeading>{showcase.title}</ShowcaseHeading>
        {!!showcase.introduction && (
          <Text numberOfLines={2} style={[textStyles.body, { color: theme.colors.text }]}>
            {showcase.introduction}
          </Text>
        )}
        <ShowcaseHint>
          {showcase.entries.length} {c.entries}
          {owner ? ` · ${c[showcase.status]}${pending ? ` · ${pending} ${c.pending}` : ''}` : ''}
        </ShowcaseHint>
      </ShowcasePanel>
    </Pressable>
  );
}

export function ProfileShowcases({ profileId, own = false }: { profileId: string; own?: boolean }) {
  const { user } = useApp();
  return (
    <ProfileShowcaseSession
      key={`${user?.id}:${profileId}:${own}`}
      profileId={profileId}
      own={own}
    />
  );
}
function ProfileShowcaseSession({ profileId, own }: { profileId: string; own: boolean }) {
  const { locale } = useApp();
  const c = showcaseCopy(locale);
  const router = useRouter();
  const [items, setItems] = useState<Showcase[]>([]);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const reload = async () => {
    const sessionVersion = session.generation.current;
    const version = ++request.current;
    setError(false);
    try {
      const next = own ? await showcaseApi.listOwn() : await showcaseApi.listProfile(profileId);
      if (session.current(sessionVersion) && request.current === version) setItems(next);
    } catch {
      if (session.current(sessionVersion) && request.current === version) {
        setItems([]);
        setError(true);
      }
    }
  };
  const session = useShowcaseSession(
    () => {
      setItems([]);
      void reload();
    },
    () => setItems([]),
  );
  useEffect(() => {
    if (!session.visible) return;
    const timer = setInterval(() => void reload(), 240_000);
    return () => clearInterval(timer);
  }, [session.visible]);
  if (!session.visible || (!own && !items.length && !error)) return null;
  return (
    <View style={showcaseStyles.section}>
      <ShowcaseHeading>{c.title}</ShowcaseHeading>
      {own && (
        <>
          <ShowcaseHint>{c.hint}</ShowcaseHint>
          <Button
            label={c.manage}
            icon="albums-outline"
            variant="secondary"
            onPress={() => router.push('/showcases' as Href)}
          />
        </>
      )}
      {items.map((item) => (
        <ShowcaseCard key={item.id} showcase={item} owner={own} />
      ))}
      {error && (
        <>
          <ShowcaseHint alert>{c.failed}</ShowcaseHint>
          <Button label={c.retry} variant="ghost" onPress={() => void reload()} />
        </>
      )}
    </View>
  );
}
