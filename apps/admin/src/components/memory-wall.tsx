'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { Camera, Coffee, Globe2, Heart, ImagePlus, MessageCircle, Pin, Play, Settings2, Share2, Trash2 } from 'lucide-react';
import type { MemoryComment, MemoryPost, MemoryWall, MemoryWallSettings } from '@rummal/shared';
import { addMemoryComment, loadMemoryComments, loadMemoryWall, memoryMediaAccept, runMemoryMutation, saveMemoryWall, uploadMemory, validateMemoryFile } from '@/lib/memory-wall';
import type { SiteLanguage } from '@/lib/public-site/config';
import s from './memory-wall.module.css';

function exampleWall(meetupId: string): MemoryWall {
  return {
    meetupId, meetupTitle: 'Kaffi & góð kynni',
    settings: { enabled: true, title: 'A little coffee. A lot of memories.', description: 'The conversations, the laughter, the moments in between. Our afternoon together, through your eyes.', layout: 'grid', accentColor: '#78dfc1' },
    canManage: true, canPost: false, canInteract: true, hasMore: false,
    posts: [
      { id: 'example-1', authorName: 'Alex', kind: 'photo' as const, caption: 'A perfect afternoon for a new connection ☕', likeCount: 12, commentCount: 0, pinned: true },
      { id: 'example-2', authorName: 'Sara', kind: 'video' as const, caption: 'A few little moments to remember.', likeCount: 8, commentCount: 0, pinned: false },
      { id: 'example-3', authorName: 'Jón', kind: 'photo' as const, caption: 'Same time next week?', likeCount: 6, commentCount: 0, pinned: false },
    ].map(post => ({ ...post, meetupId, authorId: 'example-member', createdAt: '2026-10-07T14:30:00Z', likedByViewer: false, canDelete: true })),
  };
}

type Comments = { items: MemoryComment[]; hasMore: boolean };
export function MemoryWallPage({ meetupId, language, demo = false }: { meetupId: string; language: SiteLanguage; demo?: boolean }) {
  const en = language === 'en';
  const copy = (is: string, english: string) => en ? english : is;
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [wall, setWall] = useState<MemoryWall | null>(demo ? exampleWall(meetupId) : null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<MemoryWallSettings | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [consent, setConsent] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [selectedPost, setSelectedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comments>>({});
  const [commentBody, setCommentBody] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const generation = useRef(0), latestRead = useRef(0), busyRef = useRef(false);

  useEffect(() => {
    if (demo) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key?.startsWith('sb_publishable_')) {
      setLoading(false); setError(en ? 'The memory wall service is not configured.' : 'Þjónusta minningaveggsins hefur ekki verið stillt.'); return;
    }
    // Use the existing member portal session, separate from staff authentication.
    const db = createClient(url, key, {
      global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }) },
      auth: { storage: window.sessionStorage, storageKey: 'hittumst-member-portal', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    let alive = true;
    setClient(db);
    void db.auth.getUser().then(result => { if (alive) setUser(result.data.user?.is_anonymous ? null : result.data.user); }).catch(() => {});
    const listener = db.auth.onAuthStateChange((_event, session) => { if (alive) setUser(session?.user && !session.user.is_anonymous ? session.user : null); });
    return () => { alive = false; listener.data.subscription.unsubscribe(); db.auth.stopAutoRefresh(); setClient(null); };
  }, [demo, en]);

  const refresh = useCallback(async (append = false) => {
    if (!client) return;
    const currentGeneration = generation.current, request = ++latestRead.current;
    try {
      const next = await loadMemoryWall(client, meetupId, append ? wall?.posts.length ?? 0 : 0);
      if (currentGeneration !== generation.current || request !== latestRead.current) return;
      setWall(previous => append && previous && next ? { ...next, posts: [...previous.posts, ...next.posts.filter(post => !previous.posts.some(old => old.id === post.id))] } : next);
      setError('');
    } catch {
      if (currentGeneration === generation.current && request === latestRead.current) setError(en ? 'The wall could not be loaded. Please try again.' : 'Ekki tókst að sækja minningavegginn. Reyndu aftur.');
    } finally {
      if (currentGeneration === generation.current && request === latestRead.current) setLoading(false);
    }
  }, [client, meetupId, en, wall?.posts.length]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (demo || !client) return;
    ++generation.current;
    setWall(null); setDraft(null); setComments({}); setSelectedPost(null); setCommentBody(''); setMessage(''); setLoading(true); setBusy(false); busyRef.current = false;
    void refreshRef.current();
    // Renew five-minute signed media URLs while the page is open.
    const timer = window.setInterval(() => void refreshRef.current(), 240000);
    const visible = () => { if (document.visibilityState === 'visible') void refreshRef.current(); };
    document.addEventListener('visibilitychange', visible);
    return () => { ++generation.current; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [client, user?.id, meetupId, demo]);

  async function act(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage(''); setError('');
    const currentGeneration = generation.current;
    try { await action(); } catch (failure) {
      if (currentGeneration !== generation.current) return;
      const code = failure instanceof Error ? failure.message : '';
      setError(code === 'invalid_media_type' ? copy('Veldu JPEG, PNG, WebP, MP4, MOV eða WebM.', 'Choose a JPEG, PNG, WebP, MP4, MOV or WebM file.') : code === 'invalid_media_size' ? copy('Miðill verður að vera undir 50 MB og ekki tómur.', 'Media must be nonempty and no larger than 50 MB.') : code === 'authentication_required' ? copy('Skráðu þig inn til að halda áfram.', 'Sign in to continue.') : copy('Ekki tókst að ljúka aðgerðinni. Reyndu aftur.', 'The action could not be completed. Try again.'));
    } finally { if (currentGeneration === generation.current) { busyRef.current = false; setBusy(false); } }
  }
  async function mutate(name: string, args: Record<string, unknown>) {
    if (!client) throw new Error('authentication_required');
    const currentGeneration = generation.current;
    await runMemoryMutation(client, name, args);
    if (currentGeneration === generation.current) await refreshRef.current();
  }
  async function readComments(postId: string, append = false) {
    const currentGeneration = generation.current;
    const offset = append ? comments[postId]?.items.length ?? 0 : 0;
    const items = demo ? comments[postId]?.items ?? [] : await loadMemoryComments(client!, postId, offset);
    if (currentGeneration !== generation.current) return;
    setComments(previous => ({ ...previous, [postId]: { items: append ? [...(previous[postId]?.items ?? []), ...items] : items, hasMore: !demo && items.length === 50 } }));
  }
  function localPost(postId: string, transform: (post: MemoryPost) => MemoryPost) {
    setWall(previous => previous ? { ...previous, posts: previous.posts.map(post => post.id === postId ? transform(post) : post).sort((a, b) => Number(b.pinned) - Number(a.pinned)) } : null);
  }
  const date = (value: string) => new Intl.DateTimeFormat(en ? 'en-GB' : 'is-IS', { dateStyle: 'medium', timeZone: 'Atlantic/Reykjavik' }).format(new Date(value));
  const shown = wall?.settings.enabled || wall?.canManage;

  return <main id="main" className={s.main} style={{ '--wall-accent': wall?.settings.accentColor ?? '#78dfc1' } as CSSProperties}>
    {demo && <p className={s.demo}>{copy('Forskoðun með dæmiefni. Breytingar eru aðeins sýnilegar hér.', 'Preview with example content. Changes stay in this preview.')}</p>}
    <div className={s.topline}><span><Globe2 size={15} aria-hidden="true" />{copy('Opinber minningaveggur', 'Public memory wall')}</span>{user && <button className={s.textButton} disabled={busy} onClick={() => void act(async () => { const result = await client!.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; setUser(null); setCodeSent(false); })}>{copy('Skrá út', 'Sign out')}</button>}</div>
    {loading && <p role="status" className={s.empty}>{copy('Sæki minningar…', 'Loading memories…')}</p>}
    {!loading && !shown && <section className={s.empty}><Camera size={40} aria-hidden="true" /><h1>{copy('Minningaveggurinn er ekki opinn', 'This memory wall is not available')}</h1><p>{copy('Gestgjafinn þarf að opna vegginn áður en hægt er að skoða minningar.', 'The host needs to open this wall before memories can be viewed.')}</p></section>}
    {shown && wall && <>
      <header className={s.hero}><div><span className={s.eyebrow}>Hittingar · {wall.meetupTitle}</span><h1>{wall.settings.title}</h1>{wall.settings.description && <p>{wall.settings.description}</p>}</div><div className={s.actions}>
        <button className={s.secondary} disabled={busy || !wall.settings.enabled} onClick={() => void act(async () => { await navigator.clipboard.writeText(window.location.href); setMessage(copy('Hlekkur afritaður.', 'Link copied.')); })}><Share2 size={17} aria-hidden="true" />{copy('Deila vegg', 'Share wall')}</button>
        {wall.canManage && <button className={s.secondary} aria-expanded={settingsOpen} onClick={() => { setDraft(wall.settings); setSettingsOpen(!settingsOpen); }}><Settings2 size={17} aria-hidden="true" />{copy('Sérsníða', 'Customize')}</button>}
      </div></header>
      {wall.canManage && !wall.settings.enabled && <p className={s.notice}>{copy('Veggnum hefur verið lokað. Opnaðu hann í stillingum til að birta minningar opinberlega.', 'This wall is closed. Enable it in settings to publish memories publicly.')}</p>}
      {settingsOpen && wall.canManage && draft && <form className={s.panel} onSubmit={event => { event.preventDefault(); void act(async () => { if (!demo) await saveMemoryWall(client!, meetupId, draft); setWall(previous => previous ? { ...previous, settings: draft } : previous); setSettingsOpen(false); setMessage(copy('Stillingar vistaðar.', 'Settings saved.')); if (!demo) await refreshRef.current(); }); }}>
        <h2>{copy('Gerðu vegginn að þínum', 'Make this wall yours')}</h2>
        <label className={s.checkbox}><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />{copy('Birta minningavegg opinberlega', 'Make the memory wall publicly viewable')}</label>
        <label>{copy('Titill', 'Title')}<input required maxLength={100} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>{copy('Lýsing', 'Description')}<textarea rows={3} maxLength={1000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <div className={s.fields}><label>{copy('Útlit', 'Layout')}<select value={draft.layout} onChange={event => setDraft({ ...draft, layout: event.target.value as 'grid' | 'feed' })}><option value="grid">{copy('Myndaveggur', 'Grid')}</option><option value="feed">{copy('Flæði', 'Feed')}</option></select></label><label>{copy('Áherslulitur', 'Accent color')}<input type="color" value={draft.accentColor} onChange={event => setDraft({ ...draft, accentColor: event.target.value })} /></label></div>
        <div className={s.actions}><button className={s.primary} disabled={busy}>{copy('Vista stillingar', 'Save settings')}</button><button type="button" className={s.secondary} onClick={() => setSettingsOpen(false)}>{copy('Hætta við', 'Cancel')}</button></div>
      </form>}
      {wall.canPost && user && <details className={s.panel}><summary><ImagePlus size={19} aria-hidden="true" />{copy('Deildu minningu frá Hittingnum', 'Share a memory from this Hittingur')}</summary><form onSubmit={event => { event.preventDefault(); if (!file || !consent) return; void act(async () => { await uploadMemory(client!, meetupId, file, caption); setFile(null); setCaption(''); setConsent(false); setUploadKey(previous => previous + 1); setMessage(copy('Minning send til yfirferðar. Hún birtist eftir samþykki.', 'Memory submitted for review. It will appear after approval.')); }); }}>
        <p className={s.muted}>{copy('Deildu mynd eða myndbandi sem var tekið á þessum Hittingi. Efnið verður sýnilegt öllum.', 'Share a photo or video taken at this Hittingur. Published memories are visible to everyone.')}</p>
        <label>{copy('Mynd eða myndband', 'Photo or video')}<input key={uploadKey} type="file" accept={memoryMediaAccept} required disabled={busy} onChange={event => { const selected = event.target.files?.[0] ?? null; try { if (selected) validateMemoryFile(selected); setFile(selected); setError(''); } catch { setFile(null); setError(copy('Veldu studda mynd eða myndband, að hámarki 50 MB.', 'Choose a supported photo or video, no larger than 50 MB.')); } }} /></label>
        <label>{copy('Myndatexti', 'Caption')}<textarea rows={2} maxLength={2000} value={caption} disabled={busy} onChange={event => setCaption(event.target.value)} /></label>
        <label className={s.checkbox}><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />{copy('Ég má deila þessu opinberlega og hef samþykki þeirra sem sjást.', 'I have permission to share this publicly, including consent from anyone shown.')}</label>
        <button className={s.primary} disabled={busy || !file || !consent}>{busy ? copy('Sendi…', 'Submitting…') : copy('Birta minningu', 'Post memory')}</button>
      </form></details>}
      {wall.settings.enabled && <>
        <div className={s.wallHeading}><h2>{copy('Sameiginlegar stundir', 'Moments we shared')}</h2><span>{wall.posts.length} {copy('minningar', 'memories')}</span></div>
        {!wall.posts.length && <div className={s.empty}><Camera size={36} aria-hidden="true" /><h3>{copy('Fyrsta minningin er framundan', 'The first memory is still to come')}</h3><p>{copy('Þátttakendur geta deilt myndum og myndböndum frá Hittingnum hér.', 'Attendees can share photos and videos from the Hittingur here.')}</p></div>}
        <div className={wall.settings.layout === 'feed' ? s.feed : s.grid}>{wall.posts.map((post, index) => <article className={s.card} key={post.id}>
          <div className={s.media}>
            {post.url ? post.kind === 'video' ? <video controls playsInline preload="metadata" poster={post.posterUrl} src={post.url} aria-label={post.caption || copy('Myndband frá Hittingi', 'Video from the Hittingur')} /> : <img src={post.url} alt={post.caption || copy('Mynd frá Hittingi', 'Photo from the Hittingur')} loading="lazy" /> : demo ? <div className={`${s.demoArt} ${index === 1 ? s.demoVideo : index === 2 ? s.demoEvening : ''}`}><span>{post.kind === 'video' ? <Play size={48} aria-hidden="true" /> : <Coffee size={58} aria-hidden="true" />}</span><small>{copy('Dæmi um minningu', 'Example memory')}</small></div> : <p className={s.mediaUnavailable}><Camera size={28} aria-hidden="true" />{copy('Miðill óaðgengilegur. Endurhladdu vegginn.', 'Media unavailable. Reload the wall.')}</p>}
            {post.pinned && <span className={s.pinned}><Pin size={12} aria-hidden="true" />{copy('Val gestgjafa', 'Host highlight')}</span>}
          </div>
          <div className={s.cardBody}><div className={s.author}><span className={s.avatar} aria-hidden="true">{post.authorName.charAt(0).toUpperCase()}</span><div><strong>{post.authorName}</strong><time dateTime={post.createdAt}>{date(post.createdAt)}</time></div></div>{post.caption && <p className={s.caption}>{post.caption}</p>}
            <div className={s.social}><button className={`${s.textButton} ${post.likedByViewer ? s.liked : ''}`} aria-pressed={post.likedByViewer} disabled={busy || (!demo && (!user || !wall.canInteract))} onClick={() => void act(async () => { if (demo) localPost(post.id, current => ({ ...current, likedByViewer: !current.likedByViewer, likeCount: current.likeCount + (current.likedByViewer ? -1 : 1) })); else await mutate('set_meetup_memory_like', { p_post_id: post.id, p_liked: !post.likedByViewer }); })}><Heart size={18} fill={post.likedByViewer ? 'currentColor' : 'none'} aria-hidden="true" /><span>{post.likeCount}</span><span className={s.srOnly}>{copy('Líkar við', 'Like')}</span></button><button className={s.textButton} disabled={busy} aria-expanded={selectedPost === post.id} onClick={() => { if (selectedPost === post.id) { setSelectedPost(null); return; } setSelectedPost(post.id); setCommentBody(''); void act(() => readComments(post.id)); }}><MessageCircle size={18} aria-hidden="true" />{post.commentCount}<span className={s.srOnly}>{copy('Athugasemdir', 'Comments')}</span></button>
              {wall.canManage && <button className={s.textButton} aria-label={post.pinned ? copy('Losa minningu', 'Unpin memory') : copy('Festa minningu', 'Pin memory')} aria-pressed={post.pinned} disabled={busy} onClick={() => void act(async () => { if (demo) localPost(post.id, current => ({ ...current, pinned: !current.pinned })); else await mutate('pin_meetup_memory', { p_post_id: post.id, p_pinned: !post.pinned }); })}><Pin size={16} aria-hidden="true" /></button>}
              {post.canDelete && <button className={s.textButton} aria-label={copy('Eyða minningu', 'Delete memory')} disabled={busy} onClick={() => { if (!window.confirm(copy('Eyða þessari minningu og athugasemdum við hana?', 'Delete this memory and its comments?'))) return; void act(async () => { if (demo) setWall(previous => previous ? { ...previous, posts: previous.posts.filter(item => item.id !== post.id) } : previous); else await mutate('delete_meetup_memory', { p_post_id: post.id }); }); }}><Trash2 size={16} aria-hidden="true" /></button>}
            </div>
            {selectedPost === post.id && <section className={s.comments} aria-label={copy('Athugasemdir', 'Comments')}>
              {!comments[post.id] ? <p role="status">{copy('Sæki athugasemdir…', 'Loading comments…')}</p> : <>{!comments[post.id].items.length && <p className={s.muted}>{copy('Engar athugasemdir enn.', 'No comments yet.')}</p>}{comments[post.id].items.map(comment => <div className={s.comment} key={comment.id}><strong>{comment.authorName}</strong><p>{comment.body}</p><time dateTime={comment.createdAt}>{date(comment.createdAt)}</time>{comment.canDelete && <button className={s.textButton} disabled={busy} aria-label={copy('Eyða athugasemd', 'Delete comment')} onClick={() => void act(async () => { if (demo) { setComments(previous => ({ ...previous, [post.id]: { ...previous[post.id], items: previous[post.id].items.filter(item => item.id !== comment.id) } })); localPost(post.id, current => ({ ...current, commentCount: Math.max(0, current.commentCount - 1) })); } else { await mutate('delete_meetup_memory_comment', { p_comment_id: comment.id }); await readComments(post.id); } })}><Trash2 size={13} aria-hidden="true" /></button>}</div>)}{comments[post.id].hasMore && <button className={s.textButton} disabled={busy} onClick={() => void act(() => readComments(post.id, true))}>{copy('Fleiri athugasemdir', 'More comments')}</button>}</>}
              {(demo || user && wall.canInteract) && <form onSubmit={event => { event.preventDefault(); void act(async () => { if (demo) { const added: MemoryComment = { id: crypto.randomUUID(), postId: post.id, authorId: 'example-member', authorName: en ? 'You' : 'Þú', body: commentBody.trim(), createdAt: new Date().toISOString(), canDelete: true }; setComments(previous => ({ ...previous, [post.id]: { items: [...(previous[post.id]?.items ?? []), added], hasMore: false } })); localPost(post.id, current => ({ ...current, commentCount: current.commentCount + 1 })); } else { await addMemoryComment(client!, post.id, commentBody); await readComments(post.id); await refreshRef.current(); } setCommentBody(''); }); }}><label className={s.srOnly} htmlFor={`comment-${post.id}`}>{copy('Bæta við athugasemd', 'Add a comment')}</label><textarea id={`comment-${post.id}`} value={commentBody} onChange={event => setCommentBody(event.target.value)} maxLength={2000} rows={2} placeholder={copy('Segðu eitthvað fallegt…', 'Say something kind…')} required disabled={busy} /><button className={s.primary} disabled={busy || !commentBody.trim()}>{copy('Senda', 'Send')}</button></form>}
            </section>}
          </div>
        </article>)}</div>
        {wall.hasMore && <button className={`${s.secondary} ${s.loadMore}`} disabled={busy} onClick={() => void act(() => refresh(true))}>{copy('Sjá fleiri minningar', 'Show more memories')}</button>}
      </>}
    </>}
    {!demo && client && !user && <details className={`${s.panel} ${s.signIn}`}><summary>{copy('Skráðu þig inn til að líka við, skrifa athugasemd eða deila minningu', 'Sign in to like, comment or share a memory')}</summary><p className={s.muted}>{copy('Notaðu netfangið á Hittumst-aðgangnum þínum. Aðeins þátttakendur geta deilt minningum.', 'Use your Hittumst account email. Only attendees can share memories.')}</p><form onSubmit={event => { event.preventDefault(); void act(async () => { if (codeSent) { const result = await client.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: 'email' }); if (result.error) throw result.error; setUser(result.data.user); setOtp(''); setCodeSent(false); } else { const result = await client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } }); if (result.error) throw result.error; setCodeSent(true); setMessage(copy('Ef aðgangur er til færðu kóða í tölvupósti.', 'If an account exists, you will receive a code by email.')); } }); }}><label>{copy('Netfang', 'Email')}<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required disabled={busy || codeSent} /></label>{codeSent && <label>{copy('Kóði úr tölvupósti', 'Email code')}<input value={otp} onChange={event => setOtp(event.target.value)} autoComplete="one-time-code" inputMode="numeric" required disabled={busy} /></label>}<div className={s.actions}><button className={s.primary} disabled={busy}>{codeSent ? copy('Staðfesta', 'Verify') : copy('Senda kóða', 'Send code')}</button>{codeSent && <button type="button" className={s.secondary} disabled={busy} onClick={() => { setCodeSent(false); setOtp(''); }}>{copy('Breyta netfangi', 'Change email')}</button>}</div></form></details>}
    {error && <div className={s.notice} role="alert"><p>{error}</p>{!demo && client && <button className={s.secondary} disabled={busy} onClick={() => void act(() => refresh())}>{copy('Reyna aftur', 'Retry')}</button>}</div>}
    {message && <p className={s.notice} role="status" aria-live="polite">{message}</p>}
    {user && wall && !wall.canPost && wall.settings.enabled && <p className={s.muted}>{copy('Aðeins þátttakendur Hittingsins geta deilt minningum á veggnum.', 'Only attendees of this Hittingur can share memories on its wall.')}</p>}
  </main>;
}
