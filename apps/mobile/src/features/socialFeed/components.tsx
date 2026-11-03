import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, type Href, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { CommunityPost, PublicCommunity } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';

export const feedPink = '#FF3975';
export const feedCopy = (locale: string) =>
  locale === 'is'
    ? {
        title: 'Samfélag',
        groups: 'HÓPAR OG SAMTÖK',
        latest: 'NÝJUSTU FÆRSLUR',
        compose: 'Skrifa færslu',
        post: 'Færsla',
        publish: 'Birta',
        placeholder: 'Hvað er að frétta?',
        members: 'meðlimir',
        join: 'Ganga í hóp',
        leave: 'Yfirgefa hóp',
        archived: 'Þessi hópur er í geymslu. Eldri færslur eru áfram aðgengilegar.',
        empty: 'Engar færslur enn. Vertu fyrst til að skrifa.',
        emptyGroups: 'Engir hópar birtir enn.',
        retry: 'Reyna aftur',
        error: 'Ekki tókst að sækja eða vista. Reyndu aftur.',
        loadMore: 'Sjá fleiri',
        like: 'Líka',
        unlike: 'Aflíka',
        comments: 'Athugasemdir',
        comment: 'Skrifa athugasemd',
        send: 'Senda',
        delete: 'Eyða',
        confirmDelete: 'Eyða þessari færslu?',
        cancel: 'Hætta við',
        report: 'Tilkynna',
        reportSent: 'Tilkynning móttekin.',
        reportDetails: 'Segðu okkur hvað gerðist',
        picture: 'Bæta við mynd',
        removePicture: 'Fjarlægja mynd',
        pending: 'Mynd í yfirferð',
        rejected: 'Mynd ekki samþykkt',
        uploadError: 'Færslan er birt. Myndin hlóðst ekki upp; reyndu aftur.',
        global: 'Allt samfélagið',
        archivedJoin: 'Gakktu í hópinn til að skrifa færslu.',
        refresh: 'Endurnýja',
        noComments: 'Engar athugasemdir enn.',
        access: 'Skráðu þig inn og ljúktu prófílnum til að opna samfélagið.',
      }
    : {
        title: 'Community',
        groups: 'GROUPS AND ORGANISATIONS',
        latest: 'LATEST POSTS',
        compose: 'Write a post',
        post: 'Post',
        publish: 'Publish',
        placeholder: 'What is happening?',
        members: 'members',
        join: 'Join community',
        leave: 'Leave community',
        archived: 'This community is archived. Earlier posts remain available.',
        empty: 'No posts yet. Be the first to write.',
        emptyGroups: 'No communities published yet.',
        retry: 'Retry',
        error: 'Unable to load or save. Please retry.',
        loadMore: 'Load more',
        like: 'Like',
        unlike: 'Unlike',
        comments: 'Comments',
        comment: 'Write a comment',
        send: 'Send',
        delete: 'Delete',
        confirmDelete: 'Delete this post?',
        cancel: 'Cancel',
        report: 'Report',
        reportSent: 'Report received.',
        reportDetails: 'Tell us what happened',
        picture: 'Add a picture',
        removePicture: 'Remove picture',
        pending: 'Picture under review',
        rejected: 'Picture not approved',
        uploadError: 'Your post is published. The picture upload failed; retry it.',
        global: 'Whole community',
        archivedJoin: 'Join this community to publish a post.',
        refresh: 'Refresh',
        noComments: 'No comments yet.',
        access: 'Sign in and finish your profile to open the community.',
      };
export function useFeedSession(onResume: () => void, onSuspend?: () => void) {
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
        generation.current++;
        active.current = true;
        setVisible(true);
        resume.current();
      };
      const stop = () => {
        generation.current++;
        active.current = false;
        setVisible(false);
        suspend.current?.();
      };
      if (AppState.currentState === 'active') start();
      const sub = AppState.addEventListener('change', (state) =>
        state === 'active' ? start() : stop(),
      );
      return () => {
        sub.remove();
        stop();
      };
    }, [user?.id]),
  );
  return {
    generation,
    active,
    visible,
    current: (request: number) => active.current && generation.current === request,
  };
}
export function FeedHeading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={feedStyles.heading}>
      {children}
    </Text>
  );
}
export function FeedLabel({ children }: { children: ReactNode }) {
  const { theme } = useApp();
  return (
    <Text accessibilityRole="header" style={[feedStyles.label, { color: theme.colors.textMuted }]}>
      {children}
    </Text>
  );
}
export function FeedHint({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const { theme } = useApp();
  return (
    <Text
      accessibilityRole={error ? 'alert' : undefined}
      style={{ color: error ? theme.colors.danger : theme.colors.textMuted, lineHeight: 21 }}
    >
      {children}
    </Text>
  );
}
export function FeedBusy() {
  return (
    <ActivityIndicator
      accessibilityLabel="Loading"
      color={feedPink}
      style={{ marginVertical: 20 }}
    />
  );
}
export function CommunityCard({ item }: { item: PublicCommunity }) {
  const router = useRouter();
  const { locale, theme } = useApp();
  const c = feedCopy(locale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.memberCount} ${c.members}`}
      onPress={() => router.push(`/samfelag/community/${item.id}` as Href)}
      style={[
        feedStyles.communityCard,
        { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
      ]}
    >
      {item.coverUrl ? (
        <Image
          source={{ uri: item.coverUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="none"
        />
      ) : (
        <Ionicons
          name="people-outline"
          size={34}
          color={theme.colors.textMuted}
          style={{ margin: 16 }}
        />
      )}
      <View style={feedStyles.memberBadge}>
        <Text style={{ color: '#FFFFFF', fontSize: 11 }}>
          {item.memberCount} {c.members}
        </Text>
      </View>
      <View style={feedStyles.cardCaption}>
        <Text style={{ color: '#FFFFFF', fontWeight: '700', lineHeight: 19 }}>{item.name}</Text>
      </View>
    </Pressable>
  );
}
export function PostCard({
  item,
  onLike,
  onDelete,
  disabled = false,
}: {
  item: CommunityPost;
  onLike: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  const { locale, theme } = useApp();
  const { reducedMotion } = useAppearance();
  const portrait =
    reducedMotion && item.author.photoPath?.endsWith('.gif')
      ? item.author.photoPosterUrl
      : item.author.photoUrl;
  const c = feedCopy(locale);
  const router = useRouter();
  const date = new Date(item.createdAt).toLocaleString(locale === 'is' ? 'is-IS' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Atlantic/Reykjavik',
  });
  return (
    <View
      style={[
        feedStyles.postCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={feedStyles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.author.displayName}
          onPress={() => router.push(`/profile/${item.author.id}` as Href)}
        >
          {portrait ? (
            <Image source={{ uri: portrait }} style={feedStyles.avatar} cachePolicy="none" />
          ) : (
            <View
              style={[
                feedStyles.avatar,
                feedStyles.avatarFallback,
                { backgroundColor: theme.colors.surfaceRaised },
              ]}
            >
              <Text style={{ color: theme.colors.text }}>
                {item.author.displayName.slice(0, 1)}
              </Text>
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700', lineHeight: 20 }}>
            {item.author.displayName}
            {item.author.pronouns ? ` (${item.author.pronouns})` : ''}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 }}>
            {date}
          </Text>
          {item.community && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/samfelag/community/${item.community!.id}` as Href)}
            >
              <Text style={{ color: feedPink, fontSize: 12 }}>{item.community.name}</Text>
            </Pressable>
          )}
        </View>
        {onDelete && item.canDelete && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={c.delete}
            disabled={disabled}
            onPress={onDelete}
            style={feedStyles.iconTap}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.post}: ${item.body}`}
        onPress={() => router.push(`/samfelag/post/${item.id}` as Href)}
      >
        <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 22 }}>{item.body}</Text>
      </Pressable>
      {item.imageStatus === 'approved' && item.imageUrl && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={c.post}
          onPress={() => router.push(`/samfelag/post/${item.id}` as Href)}
        >
          <Image
            source={{ uri: item.imageUrl }}
            style={feedStyles.postImage}
            contentFit="contain"
            cachePolicy="none"
          />
        </Pressable>
      )}
      {item.canDelete && item.imageStatus === 'pending' && <FeedHint>{c.pending}</FeedHint>}
      {item.canDelete && item.imageStatus === 'rejected' && <FeedHint>{c.rejected}</FeedHint>}
      <View style={feedStyles.row}>
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${item.liked ? c.unlike : c.like} (${item.likeCount})`}
          accessibilityState={{ selected: item.liked, disabled }}
          onPress={onLike}
          style={feedStyles.counter}
        >
          <Ionicons
            name={item.liked ? 'heart' : 'heart-outline'}
            size={19}
            color={item.liked ? feedPink : theme.colors.textMuted}
          />
          <Text style={{ color: theme.colors.textMuted }}>{item.likeCount}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${c.comments} (${item.commentCount})`}
          onPress={() => router.push(`/samfelag/post/${item.id}` as Href)}
          style={feedStyles.counter}
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.textMuted} />
          <Text style={{ color: theme.colors.textMuted }}>{item.commentCount}</Text>
        </Pressable>
      </View>
    </View>
  );
}
export const feedStyles = StyleSheet.create({
  heading: { color: feedPink, fontSize: 28, fontWeight: '800', lineHeight: 36 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  communityCard: {
    width: 148,
    minHeight: 112,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  memberBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#071410BB',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardCaption: { backgroundColor: '#071410CC', paddingHorizontal: 11, paddingVertical: 9 },
  postCard: { borderRadius: 16, borderWidth: 1, padding: 15, gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  postImage: { width: '100%', aspectRatio: 1.8, borderRadius: 8 },
  iconTap: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  counter: { minHeight: 44, minWidth: 60, flexDirection: 'row', gap: 7, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 140,
    textAlignVertical: 'top',
    lineHeight: 23,
  },
  gap: { gap: 16 },
});
