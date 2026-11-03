import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import type { CommunityPost, PublicCommunity } from '@rummal/shared';
import { Screen, Button, IconButton } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { socialFeedApi } from '@/services/socialFeed';
import {
  CommunityCard,
  FeedBusy,
  FeedHeading,
  FeedHint,
  FeedLabel,
  PostCard,
  feedCopy,
  feedStyles,
  useFeedSession,
} from './components';

export function SocialFeed({ communityId }: { communityId?: string }) {
  const { user } = useApp();
  return <FeedSession key={`${user?.id}:${communityId}`} communityId={communityId} />;
}
function FeedSession({ communityId }: { communityId?: string }) {
  const { locale, user } = useApp();
  const c = feedCopy(locale);
  const router = useRouter();
  const [communities, setCommunities] = useState<PublicCommunity[]>([]);
  const [community, setCommunity] = useState<PublicCommunity | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const version = useRef(0);
  const load = async (more = false) => {
    const request = session.generation.current;
    const attempt = ++version.current;
    setLoading(true);
    setError(false);
    try {
      const page = await socialFeedApi.feed(communityId, more ? cursor : null);
      const directory = !more
        ? communityId
          ? [await socialFeedApi.community(communityId)]
          : await socialFeedApi.directory()
        : null;
      if (!session.current(request) || attempt !== version.current) return;
      setPosts((old) =>
        more
          ? [
              ...old,
              ...page.items.filter((item) => !old.some((existing) => existing.id === item.id)),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
      if (directory) {
        if (communityId) setCommunity(directory[0]!);
        else setCommunities(directory);
      }
    } catch {
      if (session.current(request) && attempt === version.current) {
        setError(true);
        if (!more) {
          setPosts([]);
          setCommunities([]);
          setCommunity(null);
        }
      }
    } finally {
      if (session.current(request) && attempt === version.current) setLoading(false);
    }
  };
  const session = useFeedSession(
    () => {
      setBusy(operation.current);
      void load();
    },
    () => {
      setPosts([]);
      setCommunities([]);
      setCommunity(null);
    },
  );
  const run = async (task: () => Promise<void>) => {
    if (operation.current || !session.active.current) return;
    operation.current = true;
    setBusy(true);
    const request = session.generation.current;
    try {
      await task();
      if (session.current(request)) await load();
    } catch {
      if (session.current(request)) setError(true);
    } finally {
      operation.current = false;
      if (session.active.current) setBusy(false);
    }
  };
  const canCompose = !communityId || (community?.status === 'active' && community.joined);
  return (
    <Screen back={Boolean(communityId)}>
      <View style={feedStyles.gap}>
        <View style={[feedStyles.row, { justifyContent: 'space-between' }]}>
          <FeedHeading>{communityId ? (community?.name ?? c.title) : c.title}</FeedHeading>
          {canCompose && (
            <IconButton
              icon="add"
              label={c.compose}
              onPress={() =>
                router.push(
                  `/samfelag/compose${communityId ? `?communityId=${communityId}` : ''}` as Href,
                )
              }
            />
          )}
        </View>
        {!user ? (
          <FeedHint>{c.access}</FeedHint>
        ) : (
          <>
            {!communityId && (
              <View>
                <FeedLabel>{c.groups}</FeedLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12 }}
                >
                  {communities.map((item) => (
                    <CommunityCard key={item.id} item={item} />
                  ))}
                </ScrollView>
                {!loading && !communities.length && !error && <FeedHint>{c.emptyGroups}</FeedHint>}
              </View>
            )}
            {community && (
              <View style={feedStyles.gap}>
                <FeedHint>{community.description}</FeedHint>
                <FeedHint>
                  {community.memberCount} {c.members}
                </FeedHint>
                {community.status === 'archived' && <FeedHint>{c.archived}</FeedHint>}
                {(community.status === 'active' || community.joined) && (
                  <Button
                    label={community.joined ? c.leave : c.join}
                    variant="secondary"
                    loading={busy}
                    onPress={() =>
                      void run(async () => {
                        await socialFeedApi.setMembership(community.id, !community.joined);
                      })
                    }
                  />
                )}
                {community.status === 'active' && !community.joined && (
                  <FeedHint>{c.archivedJoin}</FeedHint>
                )}
              </View>
            )}
            <View style={[feedStyles.row, { justifyContent: 'space-between' }]}>
              <FeedLabel>{c.latest}</FeedLabel>
              <IconButton icon="refresh-outline" label={c.refresh} onPress={() => void load()} />
            </View>
            {error && (
              <>
                <FeedHint error>{c.error}</FeedHint>
                <Button label={c.retry} variant="secondary" onPress={() => void load()} />
              </>
            )}
            {session.visible &&
              posts.map((item) => (
                <PostCard
                  key={item.id}
                  item={item}
                  disabled={busy}
                  onLike={() =>
                    void run(async () => {
                      await socialFeedApi.setLiked(item.id, !item.liked);
                    })
                  }
                />
              ))}
            {loading && <FeedBusy />}
            {!loading && !posts.length && !error && <FeedHint>{c.empty}</FeedHint>}
            {cursor && (
              <Button
                label={c.loadMore}
                loading={loading}
                variant="secondary"
                onPress={() => void load(true)}
              />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
