import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import type { MemoryComment, MemoryPost, MemoryWall as MemoryWallData, MemoryWallSettings } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, Field, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { memoryWallApi } from '@/services/memoryWall';
import { runtimeEnv } from '@/services/env';
import { confirmAction } from '@/utils/confirmAction';
import { EventMediaPreview, type PendingEventMedia } from './EventMedia';

const POST_PAGE_SIZE = 30;
const COMMENT_PAGE_SIZE = 20;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const ACCENT_COLORS = ['#C65A3A', '#25836A', '#5777CA', '#9A598F', '#D59635'];

function useMemoryWall(id: string, refreshMedia = false) {
  const { user } = useApp();
  const [wall, setWall] = useState<MemoryWallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const active = useRef(false);
  const revision = useRef(0);
  const paging = useRef(false);
  const visiblePostCount = useRef(POST_PAGE_SIZE);

  const reload = useCallback(async () => {
    if (!active.current) return;
    const request = ++revision.current;
    setLoading(true); setError(false); setUnavailable(false);
    try {
      const pageCount = Math.max(1, Math.ceil(visiblePostCount.current / POST_PAGE_SIZE));
      const pages = await Promise.all(Array.from({ length: pageCount }, (_, index) => memoryWallApi.getWall(id, POST_PAGE_SIZE, index * POST_PAGE_SIZE)));
      if (active.current && request === revision.current) {
        const posts = [...new Map(pages.flatMap(page => page.posts).map(post => [post.id, post])).values()];
        visiblePostCount.current = Math.max(POST_PAGE_SIZE, posts.length);
        setWall({ ...pages[0]!, posts, hasMore: pages[pages.length - 1]!.hasMore });
      }
    } catch (failure) {
      if (active.current && request === revision.current) {
        if (failure instanceof Error && /memory_wall_unavailable/.test(failure.message)) { setWall(null); setUnavailable(true); }
        else setError(true);
      }
    }
    finally { if (active.current && request === revision.current) setLoading(false); }
  }, [id, user?.id]);

  useFocusEffect(useCallback(() => {
    const clear = () => { active.current = false; ++revision.current; visiblePostCount.current = POST_PAGE_SIZE; setWall(null); setLoading(true); };
    const resume = () => { active.current = true; void reload(); };
    if (AppState.currentState === 'active') resume();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') resume(); else clear(); });
    const timer = refreshMedia ? setInterval(() => { if (active.current) void reload(); }, 240_000) : undefined;
    return () => { subscription.remove(); if (timer) clearInterval(timer); clear(); };
  }, [reload, refreshMedia]));

  const loadMore = async () => {
    if (!wall || !wall.hasMore || loading || paging.current || !active.current) return;
    const request = ++revision.current;
    paging.current = true; setLoading(true); setError(false);
    try {
      const next = await memoryWallApi.getWall(id, POST_PAGE_SIZE, wall.posts.length);
      if (active.current && request === revision.current) setWall(current => {
        const posts = current ? [...current.posts, ...next.posts.filter(post => !current.posts.some(previous => previous.id === post.id))] : next.posts;
        visiblePostCount.current = Math.max(POST_PAGE_SIZE, posts.length);
        return { ...next, posts };
      });
    } catch { if (active.current && request === revision.current) setError(true); }
    finally { paging.current = false; if (active.current && request === revision.current) setLoading(false); }
  };
  return { wall, loading, error, unavailable, reload, loadMore, active };
}

export function MemoryWallLink({ id }: { id: string }) {
  const { locale, theme } = useApp();
  const { wall, error, unavailable, reload } = useMemoryWall(id);
  const router = useRouter();
  const is = locale === 'is';
  if (unavailable) return null;
  if (error) return <View style={styles.section}><Text accessibilityRole="alert" style={{ color: theme.colors.textMuted }}>{is ? 'Ekki tókst að sækja minningavegginn.' : 'The memory wall could not be loaded.'}</Text><Button variant="ghost" label={is ? 'Reyna aftur' : 'Retry'} onPress={() => void reload()} /></View>;
  if (!wall?.settings.enabled) return null;
  return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: wall.settings.accentColor }]}>
    <View style={styles.header}><Ionicons name="images-outline" size={26} color={wall.settings.accentColor} /><View style={styles.copy}><Text style={[textStyles.heading, { color: theme.colors.text }]}>{wall.settings.title}</Text><Text style={[textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Opinberar minningar sem þátttakendur deila frá hittingnum.' : 'Public memories shared by people who attended this hittingur.'}</Text></View></View>
    <Button label={is ? 'Skoða minningavegg' : 'View wall of memories'} icon="arrow-forward-outline" variant="secondary" onPress={() => router.push(`/hittingar/${id}/memories` as Href)} />
  </View>;
}

export function MemoryWallSettingsEditor({ id, publiclyShareable = true }: { id: string; publiclyShareable?: boolean }) {
  const { user } = useApp();
  return <MemoryWallSettingsSession key={`${id}:${user?.id}`} id={id} publiclyShareable={publiclyShareable} />;
}

function MemoryWallSettingsSession({ id, publiclyShareable }: { id: string; publiclyShareable: boolean }) {
  const { locale, theme } = useApp();
  const router = useRouter();
  const is = locale === 'is';
  const { wall, loading, error, reload, active } = useMemoryWall(id);
  const [draft, setDraft] = useState<MemoryWallSettings | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  useEffect(() => { setDraft(wall?.settings ?? null); setAcknowledged(Boolean(wall?.settings.enabled)); setSaved(false); }, [wall?.settings]);

  const save = async () => {
    if (!draft || !active.current || saving.current || !draft.title.trim() || (draft.enabled && !acknowledged)) return;
    saving.current = true; setBusy(true); setSaveError(false); setSaved(false);
    try {
      await memoryWallApi.updateSettings(id, { ...draft, title: draft.title.trim(), description: draft.description.trim() });
      if (active.current) { await reload(); if (active.current) setSaved(true); }
    } catch { if (active.current) setSaveError(true); }
    finally { saving.current = false; if (active.current) setBusy(false); }
  };

  if (loading && !draft) return <Text style={{ color: theme.colors.textMuted }}>{is ? 'Sæki minningavegg…' : 'Loading memory wall…'}</Text>;
  if (error && !draft) return <View style={styles.section}><WallError /><Button variant="secondary" label={is ? 'Reyna aftur' : 'Retry'} onPress={() => void reload()} /></View>;
  if (!wall?.canManage || !draft) return null;
  const update = (changes: Partial<MemoryWallSettings>) => { setDraft(current => current ? { ...current, ...changes } : null); setSaved(false); };
  return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{is ? 'Minningaveggur' : 'Wall of memories'}</Text>
    <Text style={[textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Sýndu hittinginn með myndum og myndböndum frá þátttakendum. Veggurinn er opinber þegar hann er virkur.' : 'Showcase your hittingur with attendees’ photos and videos. The wall is publicly viewable when enabled.'}</Text>
    {!publiclyShareable && <Text style={[textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Opinberir minningaveggir eru aðeins í boði fyrir birta, opna hittinga án aldurstakmarkaðs efnis eða greiningarskilyrða.' : 'Public memory walls are available for published, open hittingar without explicit content or diagnosis restrictions.'}</Text>}
    <View style={styles.header}><Text style={[styles.copy, styles.label, { color: theme.colors.text }]}>{is ? 'Virkja opinberan minningavegg' : 'Enable public memory wall'}</Text><Switch accessibilityLabel={is ? 'Virkja opinberan minningavegg' : 'Enable public memory wall'} value={draft.enabled} disabled={busy || (!publiclyShareable && !draft.enabled)} onValueChange={enabled => { if (!enabled || publiclyShareable) update({ enabled }); }} trackColor={{ true: theme.colors.accent }} /></View>
    <Field label={is ? 'Heiti veggs' : 'Wall title'} value={draft.title} onChangeText={title => update({ title })} maxLength={100} editable={!busy} />
    <Field label={is ? 'Lýsing' : 'Description'} value={draft.description} onChangeText={description => update({ description })} maxLength={1000} multiline editable={!busy} />
    <Text style={[styles.label, { color: theme.colors.text }]}>{is ? 'Útlit' : 'Layout'}</Text>
    <View style={styles.actions}><ChoiceChip label={is ? 'Myndareitir' : 'Photo grid'} selected={draft.layout === 'grid'} onPress={() => { if (!busy) update({ layout: 'grid' }); }} /><ChoiceChip label={is ? 'Færsluflæði' : 'Story feed'} selected={draft.layout === 'feed'} onPress={() => { if (!busy) update({ layout: 'feed' }); }} /></View>
    <Text style={[styles.label, { color: theme.colors.text }]}>{is ? 'Áherslulitur' : 'Accent color'}</Text>
    <View style={styles.actions}>{ACCENT_COLORS.map(color => <Pressable key={color} accessibilityRole="radio" accessibilityLabel={`${is ? 'Litur' : 'Color'} ${color}`} accessibilityState={{ selected: draft.accentColor === color, disabled: busy }} disabled={busy} onPress={() => update({ accentColor: color })} style={[styles.swatch, { backgroundColor: color, borderColor: draft.accentColor === color ? theme.colors.text : theme.colors.border }]}>{draft.accentColor === color && <Ionicons name="checkmark" size={23} color="#FFFFFF" />}</Pressable>)}</View>
    {draft.enabled && <ChoiceChip label={is ? 'Ég skil að myndir, myndbönd, birtingarnöfn og athugasemdir á þessum vegg verða opinber.' : 'I understand that photos, videos, display names and comments on this wall will be public.'} selected={acknowledged} onPress={() => { if (!busy) setAcknowledged(value => !value); }} />}
    {(saveError || error) && <WallError />}
    {saved && <Text accessibilityRole="alert" style={{ color: theme.colors.textMuted }}>{is ? 'Stillingar vistaðar.' : 'Wall settings saved.'}</Text>}
    <Button label={is ? 'Vista minningavegg' : 'Save memory wall'} loading={busy} disabled={!draft.title.trim() || (draft.enabled && (!acknowledged || !publiclyShareable))} onPress={() => void save()} />
    {wall.settings.enabled && <Button variant="ghost" icon="images-outline" label={is ? 'Skoða og stjórna minningum' : 'View and manage memories'} onPress={() => router.push(`/hittingar/${id}/memories` as Href)} />}
  </View>;
}

export function MemoryWallFeed({ id }: { id: string }) {
  const { user } = useApp();
  return <MemoryWallFeedSession key={`${id}:${user?.id}`} id={id} />;
}

function MemoryWallFeedSession({ id }: { id: string }) {
  const { locale, theme } = useApp();
  const router = useRouter();
  const is = locale === 'is';
  const { wall, loading, error, unavailable, reload, loadMore, active } = useMemoryWall(id, true);
  const [shareError, setShareError] = useState(false);
  if (unavailable) return <View style={styles.section}><Text style={[textStyles.heading, { color: theme.colors.text }]}>{is ? 'Minningaveggurinn er ekki tiltækur' : 'This memory wall is unavailable'}</Text><Text style={{ color: theme.colors.textMuted }}>{is ? 'Gestgjafinn hefur ekki gert vegginn opinberlega aðgengilegan.' : 'The host has not made this wall publicly available.'}</Text><Button variant="secondary" label={is ? 'Reyna aftur' : 'Retry'} onPress={() => void reload()} /></View>;
  if (!wall) return <View style={styles.section}>{loading ? <Text style={{ color: theme.colors.textMuted }}>{is ? 'Sæki minningar…' : 'Loading memories…'}</Text> : <><WallError /><Button label={is ? 'Reyna aftur' : 'Retry'} onPress={() => void reload()} /></>}</View>;
  if (!wall.settings.enabled) return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Ionicons name="images-outline" size={34} color={theme.colors.textMuted} /><Text style={[textStyles.heading, { color: theme.colors.text }]}>{is ? 'Minningaveggurinn er ekki virkur' : 'This memory wall is not enabled'}</Text><Text style={{ color: theme.colors.textMuted }}>{is ? 'Gestgjafinn velur hvort minningar frá hittingnum séu birtar opinberlega.' : 'The host chooses whether memories from this hittingur are shared publicly.'}</Text>{wall.canManage && <Button label={is ? 'Stilla minningavegg' : 'Customize memory wall'} onPress={() => router.push(`/hittingar/${id}/manage` as Href)} />}</View>;
  const share = async () => {
    if (!runtimeEnv.websiteUrl) return;
    setShareError(false);
    const url = `${runtimeEnv.websiteUrl}/hittingar/${encodeURIComponent(id)}/memories${is ? '' : '?lang=en'}`;
    try { await Share.share({ title: wall.settings.title, message: `${wall.settings.title}\n${url}`, url }); }
    catch { if (active.current) setShareError(true); }
  };
  return <View style={styles.section}>
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: wall.settings.accentColor, borderTopWidth: 5 }]}>
      <Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{wall.meetupTitle}</Text>
      <Text style={[textStyles.title, { color: theme.colors.text }]}>{wall.settings.title}</Text>
      {Boolean(wall.settings.description) && <Text style={[textStyles.body, { color: theme.colors.text }]}>{wall.settings.description}</Text>}
      <View style={styles.header}><Ionicons name="globe-outline" size={18} color={theme.colors.textMuted} /><Text style={[styles.copy, textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Opinber veggur · minningar frá þátttakendum' : 'Public wall · memories from attendees'}</Text></View>
      {runtimeEnv.websiteUrl && <Button label={is ? 'Deila veggnum' : 'Share this wall'} icon="share-outline" variant="secondary" onPress={() => void share()} />}
      {shareError && <WallError />}
      {wall.canManage && <Button variant="ghost" label={is ? 'Breyta útliti veggs' : 'Customize wall'} onPress={() => router.push(`/hittingar/${id}/manage` as Href)} />}
    </View>
    {wall.canPost ? <MemoryComposer id={id} onPosted={reload} /> : <Text style={[textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Gestgjafinn og þátttakendur með staðfesta mætingu geta deilt minningum eftir að hittingurinn hefst.' : 'The host and attendees with verified attendance can share memories once the hittingur starts.'}</Text>}
    {!wall.posts.length && <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[textStyles.heading, { color: theme.colors.text }]}>{is ? 'Minningarnar byrja hér' : 'The memories start here'}</Text><Text style={{ color: theme.colors.textMuted }}>{is ? 'Samþykktar myndir og myndbönd frá hittingnum munu birtast á þessum vegg.' : 'Approved photos and videos from this hittingur will appear on this wall.'}</Text></View>}
    <View style={wall.settings.layout === 'grid' ? styles.grid : styles.section}>{wall.posts.map(post => <View key={post.id} style={wall.settings.layout === 'grid' ? styles.gridItem : undefined}><MemoryPostCard post={post} canInteract={wall.canInteract} canManage={wall.canManage} onChanged={reload} /></View>)}</View>
    {error && <><WallError /><Button variant="secondary" label={is ? 'Reyna aftur' : 'Retry'} onPress={() => void reload()} /></>}
    {wall.hasMore && <Button variant="secondary" label={is ? 'Sækja fleiri minningar' : 'Load more memories'} loading={loading} onPress={() => void loadMore()} />}
  </View>;
}

function MemoryComposer({ id, onPosted }: { id: string; onPosted: () => Promise<void> }) {
  const { locale, theme } = useApp();
  const is = locale === 'is';
  const [media, setMedia] = useState<PendingEventMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'size' | 'failed' | null>(null);
  const [queued, setQueued] = useState(false);
  const active = useRef(false);
  const operation = useRef(false);
  useFocusEffect(useCallback(() => { active.current = true; return () => { active.current = false; }; }, []));
  const pick = async () => {
    if (operation.current || !active.current) return;
    operation.current = true; setBusy(true); setError(null); setQueued(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
      if (!active.current || result.canceled) return;
      const asset = result.assets[0];
      if (!asset || !['image', 'video'].includes(asset.type ?? '')) throw new Error('invalid_media');
      if ((asset.fileSize ?? 0) > MAX_MEDIA_BYTES) throw new Error('media_size');
      const kind = asset.type === 'video' ? 'video' as const : 'photo' as const;
      setMedia({ uri: asset.uri, kind, mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg') }); setAcknowledged(false);
    } catch (failure) { if (active.current) setError(failure instanceof Error && failure.message === 'media_size' ? 'size' : 'failed'); }
    finally { operation.current = false; if (active.current) setBusy(false); }
  };
  const upload = async () => {
    if (!media || !acknowledged || operation.current || !active.current) return;
    operation.current = true; setBusy(true); setError(null); setQueued(false);
    try {
      await memoryWallApi.upload(id, media.uri, media.kind, media.mimeType, caption.trim());
      if (active.current) { setMedia(null); setCaption(''); setAcknowledged(false); setQueued(true); await onPosted(); }
    } catch (failure) { if (active.current) setError(failure instanceof Error && /size|50mb|too.large/i.test(failure.message) ? 'size' : 'failed'); }
    finally { operation.current = false; if (active.current) setBusy(false); }
  };
  return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{is ? 'Deildu minningu' : 'Share a memory'}</Text>
    <Text style={[textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Myndir og myndbönd frá hittingnum, allt að 50 MB. Fáðu leyfi frá fólki sem sést áður en þú deilir.' : 'Photos and videos taken at this hittingur, up to 50 MB. Get permission from anyone shown before sharing.'}</Text>
    {media && <><EventMediaPreview uri={media.uri} kind={media.kind} /><Field label={is ? 'Myndatexti (valfrjálst)' : 'Caption (optional)'} value={caption} onChangeText={setCaption} multiline maxLength={2000} editable={!busy} /><ChoiceChip label={is ? 'Ég hef leyfi til að deila þessu efni opinberlega og skil að birtingarnafnið mitt birtist með því.' : 'I have permission to share this publicly and understand that my display name will appear with it.'} selected={acknowledged} onPress={() => { if (!busy) setAcknowledged(value => !value); }} /><Button label={is ? 'Senda minningu til yfirferðar' : 'Submit memory for review'} loading={busy} disabled={!acknowledged} onPress={() => void upload()} /><Button variant="ghost" label={is ? 'Hætta við' : 'Cancel'} disabled={busy} onPress={() => { setMedia(null); setCaption(''); setAcknowledged(false); }} /></>}
    <Button label={media ? (is ? 'Velja annan miðil' : 'Choose different media') : (is ? 'Velja mynd eða myndband' : 'Choose photo or video')} variant="secondary" icon="images-outline" loading={!media && busy} disabled={busy} onPress={() => void pick()} />
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error === 'size' ? (is ? 'Skráin má ekki vera stærri en 50 MB.' : 'Choose a file smaller than 50 MB.') : (is ? 'Ekki tókst að senda minninguna. Reyndu aftur.' : 'Your memory could not be submitted. Please try again.')}</Text>}
    {queued && <Text accessibilityRole="alert" style={{ color: theme.colors.textMuted }}>{is ? 'Minningin er í yfirferð og birtist opinberlega þegar hún hefur verið samþykkt.' : 'Your memory is being reviewed and will appear publicly once approved.'}</Text>}
  </View>;
}

function MemoryPostCard({ post, canInteract, canManage, onChanged }: { post: MemoryPost; canInteract: boolean; canManage: boolean; onChanged: () => Promise<void> }) {
  const { locale, theme } = useApp();
  const is = locale === 'is';
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(false);
  const operation = useRef(false);
  useFocusEffect(useCallback(() => { active.current = true; return () => { active.current = false; }; }, []));
  const run = async (action: () => Promise<unknown>) => {
    if (!active.current || operation.current) return;
    operation.current = true; setBusy(true); setError(false);
    try { await action(); if (active.current) await onChanged(); }
    catch { if (active.current) setError(true); }
    finally { operation.current = false; if (active.current) setBusy(false); }
  };
  const remove = () => confirmAction({ title: is ? 'Eyða minningu?' : 'Delete this memory?', message: is ? 'Myndinni eða myndbandinu og athugasemdunum verður eytt af veggnum.' : 'The photo or video and its comments will be removed from the wall.', cancelLabel: is ? 'Hætta við' : 'Cancel', confirmLabel: is ? 'Eyða' : 'Delete', destructive: true, onConfirm: () => run(() => memoryWallApi.deletePost(post.id)) });
  return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    {post.pinned && <View style={styles.header}><Ionicons name="pin" size={16} color={theme.colors.accent} /><Text style={[textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Fest af gestgjafa' : 'Pinned by the host'}</Text></View>}
    {post.url ? <EventMediaPreview uri={post.url} kind={post.kind} /> : <Text style={{ color: theme.colors.textMuted }}>{is ? 'Miðillinn er ekki tiltækur.' : 'This media is unavailable.'}</Text>}
    <View style={styles.section}><Text style={[styles.label, { color: theme.colors.text }]}>{post.authorName}</Text><Text style={[styles.meta, { color: theme.colors.textMuted }]}>{new Date(post.createdAt).toLocaleDateString(is ? 'is-IS' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>{Boolean(post.caption) && <Text style={[textStyles.body, { color: theme.colors.text }]}>{post.caption}</Text>}</View>
    <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={`${post.likedByViewer ? (is ? 'Fjarlægja líkar við' : 'Unlike') : (is ? 'Líkar við' : 'Like')}, ${post.likeCount}`} accessibilityState={{ selected: post.likedByViewer, disabled: busy || !canInteract }} disabled={busy || !canInteract} onPress={() => void run(() => memoryWallApi.setLike(post.id, !post.likedByViewer))} style={[styles.socialButton, { borderColor: theme.colors.border }]}><Ionicons name={post.likedByViewer ? 'heart' : 'heart-outline'} size={21} color={post.likedByViewer ? theme.colors.danger : theme.colors.text} /><Text style={{ color: theme.colors.text }}>{post.likeCount}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${commentsOpen ? (is ? 'Fela athugasemdir' : 'Hide comments') : (is ? 'Skoða athugasemdir' : 'View comments')}, ${post.commentCount}`} accessibilityState={{ expanded: commentsOpen }} onPress={() => setCommentsOpen(value => !value)} style={[styles.socialButton, { borderColor: theme.colors.border }]}><Ionicons name="chatbubble-outline" size={20} color={theme.colors.text} /><Text style={{ color: theme.colors.text }}>{post.commentCount}</Text></Pressable></View>
    {canManage && <Button variant="ghost" icon="pin-outline" label={post.pinned ? (is ? 'Losa minningu' : 'Unpin memory') : (is ? 'Festa minningu' : 'Pin memory')} disabled={busy} onPress={() => void run(() => memoryWallApi.pinPost(post.id, !post.pinned))} />}
    {post.canDelete && <Button variant="ghost" label={is ? 'Eyða minningu' : 'Delete memory'} disabled={busy} onPress={remove} />}
    {error && <WallError />}
    {commentsOpen && <MemoryComments postId={post.id} canInteract={canInteract} onChanged={onChanged} />}
  </View>;
}

function MemoryComments({ postId, canInteract, onChanged }: { postId: string; canInteract: boolean; onChanged: () => Promise<void> }) {
  const { locale, theme } = useApp();
  const is = locale === 'is';
  const [comments, setComments] = useState<MemoryComment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(false);
  const revision = useRef(0);
  const operation = useRef(false);
  const load = useCallback(async (offset = 0) => {
    if (!active.current) return;
    const request = ++revision.current;
    setLoading(true); setError(false);
    try {
      const next = await memoryWallApi.listComments(postId, COMMENT_PAGE_SIZE, offset);
      if (active.current && request === revision.current) { setComments(current => offset ? [...current, ...next.filter(comment => !current.some(previous => previous.id === comment.id))] : next); setHasMore(next.length === COMMENT_PAGE_SIZE); }
    } catch { if (active.current && request === revision.current) setError(true); }
    finally { if (active.current && request === revision.current) setLoading(false); }
  }, [postId]);
  useFocusEffect(useCallback(() => { active.current = true; void load(); return () => { active.current = false; ++revision.current; }; }, [load]));
  const run = async (action: () => Promise<unknown>, added = false) => {
    if (!active.current || operation.current) return;
    operation.current = true; setBusy(true); setError(false);
    try { await action(); if (active.current) { if (added) setBody(''); await load(); if (active.current) await onChanged(); } }
    catch { if (active.current) setError(true); }
    finally { operation.current = false; if (active.current) setBusy(false); }
  };
  const remove = (comment: MemoryComment) => confirmAction({ title: is ? 'Eyða athugasemd?' : 'Delete this comment?', message: is ? 'Athugasemdin hverfur af opinbera veggnum.' : 'The comment will be removed from the public wall.', cancelLabel: is ? 'Hætta við' : 'Cancel', confirmLabel: is ? 'Eyða' : 'Delete', destructive: true, onConfirm: () => run(() => memoryWallApi.deleteComment(comment.id)) });
  return <View style={[styles.comments, { borderColor: theme.colors.border }]}>
    <Text style={[styles.label, { color: theme.colors.text }]}>{is ? 'Athugasemdir' : 'Comments'}</Text>
    {comments.map(comment => <View key={comment.id} style={styles.section}><View style={styles.header}><Text style={[styles.copy, styles.label, { color: theme.colors.text }]}>{comment.authorName}</Text>{comment.canDelete && <Button variant="ghost" label={is ? 'Eyða' : 'Delete'} disabled={busy} onPress={() => remove(comment)} />}</View><Text style={{ color: theme.colors.text, lineHeight: 21 }}>{comment.body}</Text></View>)}
    {loading && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Sæki athugasemdir…' : 'Loading comments…'}</Text>}
    {!loading && !comments.length && !error && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Engar athugasemdir enn.' : 'No comments yet.'}</Text>}
    {error && <><WallError /><Button variant="ghost" label={is ? 'Sækja athugasemdir aftur' : 'Retry loading comments'} onPress={() => void load()} /></>}
    {hasMore && <Button variant="ghost" label={is ? 'Fleiri athugasemdir' : 'More comments'} disabled={loading || busy} onPress={() => void load(comments.length)} />}
    {canInteract ? <><Field label={is ? 'Bæta við athugasemd' : 'Add a comment'} value={body} onChangeText={setBody} multiline maxLength={2000} editable={!busy} /><Text style={[textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Athugasemdin og birtingarnafnið þitt verða opinber.' : 'Your comment and display name will be public.'}</Text><Button label={is ? 'Birta athugasemd' : 'Post comment'} loading={busy} disabled={!body.trim()} onPress={() => void run(() => memoryWallApi.addComment(postId, body.trim()), true)} /></> : <Text style={[textStyles.caption, { color: theme.colors.textMuted }]}>{is ? 'Skráðu þig inn til að líka við og skrifa athugasemdir.' : 'Sign in to like and comment.'}</Text>}
  </View>;
}

function WallError() {
  const { locale, theme } = useApp();
  return <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{locale === 'is' ? 'Ekki tókst að uppfæra minningavegginn. Reyndu aftur.' : 'The memory wall could not be updated. Please try again.'}</Text>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  copy: { flex: 1 },
  label: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  swatch: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '48%', flexGrow: 1, minWidth: 160 },
  socialButton: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  comments: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 13 },
});
