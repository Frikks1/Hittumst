import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import type { CommunityPost, CommunityComment } from '@rummal/shared';
import { Button, ChoiceChip, Screen } from '@/components/ui';
import { Text, TextInput } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { socialFeedApi } from '@/services/socialFeed';
import {
  FeedBusy,
  FeedHeading,
  FeedHint,
  FeedLabel,
  PostCard,
  feedCopy,
  feedStyles,
  useFeedSession,
} from './components';

const categories = [
  { id: 'harassment', is: 'Áreitni', en: 'Harassment' },
  { id: 'hate_discrimination', is: 'Hatur', en: 'Hate' },
  { id: 'spam_advertising', is: 'Ruslpóstur', en: 'Spam' },
  { id: 'threat', is: 'Hótun', en: 'Threat' },
  { id: 'minor_suspected', is: 'Grunur um barn', en: 'Suspected minor' },
  { id: 'ncii', is: 'Mynd án samþykkis', en: 'Image without consent' },
  { id: 'other', is: 'Annað', en: 'Other' },
];
export function FeedPost({ id }: { id: string }) {
  const { user } = useApp();
  return <PostSession key={`${user?.id}:${id}`} id={id} />;
}
function PostSession({ id }: { id: string }) {
  const { locale, theme } = useApp();
  const c = feedCopy(locale);
  const router = useRouter();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ kind: 'post' | 'comment'; id: string } | null>(
    null,
  );
  const [category, setCategory] = useState('other');
  const [details, setDetails] = useState('');
  const [reported, setReported] = useState(false);
  const operation = useRef(false);
  const requestId = useRef(Crypto.randomUUID());
  const reportRequest = useRef(Crypto.randomUUID());
  const version = useRef(0);
  const load = async (more = false) => {
    const generation = session.generation.current;
    const attempt = ++version.current;
    setLoading(true);
    try {
      const [item, page] = await Promise.all([
        socialFeedApi.post(id),
        socialFeedApi.comments(id, more ? cursor : null),
      ]);
      if (!session.current(generation) || version.current !== attempt) return;
      setPost(item);
      setComments((old) =>
        more
          ? [
              ...old,
              ...page.items.filter((next) => !old.some((existing) => existing.id === next.id)),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
      setError(false);
    } catch {
      if (session.current(generation) && version.current === attempt) {
        setError(true);
        if (!more) {
          setPost(null);
          setComments([]);
        }
      }
    } finally {
      if (session.current(generation) && version.current === attempt) setLoading(false);
    }
  };
  const session = useFeedSession(
    () => {
      setBusy(operation.current);
      void load();
    },
    () => {
      setPost(null);
      setComments([]);
    },
  );
  const refresh = useRef(load);
  refresh.current = load;
  useEffect(() => {
    if (!session.visible) return;
    const timer = setInterval(() => {
      if (!operation.current) void refresh.current();
    }, 45000);
    return () => clearInterval(timer);
  }, [session.visible]);
  const run = async (task: (generation: number) => Promise<void>) => {
    if (operation.current || !session.active.current) return;
    operation.current = true;
    const generation = session.generation.current;
    setBusy(true);
    setError(false);
    try {
      await task(generation);
    } catch {
      if (session.current(generation)) setError(true);
    } finally {
      operation.current = false;
      if (session.active.current) setBusy(false);
    }
  };
  const startReport = (kind: 'post' | 'comment', targetId: string) => {
    reportRequest.current = Crypto.randomUUID();
    setReported(false);
    setReportTarget({ kind, id: targetId });
    setDetails('');
    setCategory('other');
  };
  return (
    <Screen back>
      <View style={feedStyles.gap}>
        <FeedHeading>{c.post}</FeedHeading>
        {loading && <FeedBusy />}
        {error && (
          <>
            <FeedHint error>{c.error}</FeedHint>
            <Button label={c.retry} variant="secondary" onPress={() => void load()} />
          </>
        )}
        {session.visible && post && (
          <>
            <PostCard
              item={post}
              disabled={busy}
              onLike={() =>
                void run(async (generation) => {
                  const next = await socialFeedApi.setLiked(id, !post.liked);
                  if (session.current(generation)) setPost(next);
                })
              }
              onDelete={() => setConfirmDelete(true)}
            />
            {confirmDelete && (
              <View style={feedStyles.gap}>
                <FeedHint>{c.confirmDelete}</FeedHint>
                <Button
                  label={c.delete}
                  variant="danger"
                  loading={busy}
                  onPress={() =>
                    void run(async (generation) => {
                      await socialFeedApi.deletePost(id);
                      if (session.current(generation)) router.back();
                    })
                  }
                />
                <Button
                  label={c.cancel}
                  variant="secondary"
                  onPress={() => setConfirmDelete(false)}
                />
              </View>
            )}
            {!post.canDelete && (
              <Button label={c.report} variant="ghost" onPress={() => startReport('post', id)} />
            )}
            <FeedLabel>{c.comments}</FeedLabel>
            {!comments.length && !loading && <FeedHint>{c.noComments}</FeedHint>}
            {comments.map((item) => (
              <View
                key={item.id}
                style={[
                  feedStyles.postCard,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                ]}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                  {item.author.displayName}
                </Text>
                <Text style={{ color: theme.colors.text, lineHeight: 22 }}>{item.body}</Text>
                <View style={feedStyles.row}>
                  {item.canDelete ? (
                    <Button
                      label={c.delete}
                      variant="ghost"
                      disabled={busy}
                      onPress={() =>
                        void run(async (generation) => {
                          await socialFeedApi.deleteComment(item.id);
                          if (session.current(generation)) await load();
                        })
                      }
                    />
                  ) : (
                    <Button
                      label={c.report}
                      variant="ghost"
                      onPress={() => startReport('comment', item.id)}
                    />
                  )}
                </View>
              </View>
            ))}
            {cursor && (
              <Button
                label={c.loadMore}
                variant="secondary"
                loading={loading}
                onPress={() => void load(true)}
              />
            )}
            <TextInput
              accessibilityLabel={c.comment}
              placeholder={c.comment}
              placeholderTextColor={theme.colors.textMuted}
              value={body}
              multiline
              maxLength={2000}
              editable={!busy}
              onChangeText={(value) => {
                setBody(value);
                requestId.current = Crypto.randomUUID();
              }}
              style={[
                feedStyles.input,
                { color: theme.colors.text, borderColor: theme.colors.border },
              ]}
            />
            <Button
              label={c.send}
              loading={busy}
              disabled={!body.trim()}
              onPress={() =>
                void run(async (generation) => {
                  await socialFeedApi.comment(id, { requestId: requestId.current, body });
                  if (session.current(generation)) {
                    setBody('');
                    requestId.current = Crypto.randomUUID();
                    await load();
                  }
                })
              }
            />
            {reportTarget && (
              <View style={feedStyles.gap}>
                <FeedLabel>{c.report}</FeedLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {categories.map((item) => (
                    <ChoiceChip
                      key={item.id}
                      label={locale === 'is' ? item.is : item.en}
                      selected={category === item.id}
                      onPress={() => {
                        setCategory(item.id);
                        reportRequest.current = Crypto.randomUUID();
                      }}
                    />
                  ))}
                </View>
                <TextInput
                  accessibilityLabel={c.reportDetails}
                  placeholder={c.reportDetails}
                  placeholderTextColor={theme.colors.textMuted}
                  value={details}
                  onChangeText={(value) => {
                    setDetails(value);
                    reportRequest.current = Crypto.randomUUID();
                  }}
                  multiline
                  maxLength={2000}
                  style={[
                    feedStyles.input,
                    { color: theme.colors.text, borderColor: theme.colors.border },
                  ]}
                />
                {reported ? (
                  <FeedHint>{c.reportSent}</FeedHint>
                ) : (
                  <Button
                    label={c.send}
                    loading={busy}
                    onPress={() =>
                      void run(async (generation) => {
                        await socialFeedApi.report(
                          reportTarget.kind,
                          reportTarget.id,
                          category,
                          details,
                          reportRequest.current,
                        );
                        if (session.current(generation)) setReported(true);
                      })
                    }
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReportTarget(null)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: theme.colors.text }}>{c.cancel}</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
