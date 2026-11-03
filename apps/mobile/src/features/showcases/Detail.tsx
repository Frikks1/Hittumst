import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { type Href, useRouter } from 'expo-router';
import { showcaseSaveInput, type Showcase, type ShowcasePickers } from '@rummal/shared';
import { Button, ChoiceChip, Field, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { showcaseApi } from '@/services/showcases';
import { confirmAction } from '@/utils/confirmAction';
import type { PendingEventMedia } from '@/features/hittingar/EventMedia';
import { showcaseCopy } from './copy';
import { AdvancedSection } from './AdvancedSection';
import {
  ShowcaseAudiencePicker,
  audienceDescription,
  type ShowcaseAudienceChoice,
} from './AudiencePicker';
import {
  ShowcaseEntryView,
  ShowcaseHeading,
  ShowcaseHint,
  ShowcasePanel,
  showcaseStyles,
  useShowcaseSession,
} from './components';
import { ShowcaseEntryEditor } from './EntryEditor';
import {
  defaultEntryKind,
  moveItem,
  newEntry,
  patchEntry,
  refreshDraftMedia,
  validForSave,
} from './model';

const emptyPickers: ShowcasePickers = {
  events: [],
  friends: [],
  groups: [],
  media: [],
  requirementEvents: [],
  albums: [],
};

export function ShowcaseDetail({
  id,
  initialEditing = false,
}: {
  id: string;
  initialEditing?: boolean;
}) {
  const { user } = useApp();
  return <DetailSession key={`${user?.id}:${id}`} id={id} initialEditing={initialEditing} />;
}
function DetailSession({ id, initialEditing }: { id: string; initialEditing: boolean }) {
  const { user, locale } = useApp();
  const c = showcaseCopy(locale);
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Showcase | null>(null);
  const [draft, setDraft] = useState<Showcase | null>(null);
  const [pickers, setPickers] = useState<ShowcasePickers>(emptyPickers);
  const [editing, setEditing] = useState(initialEditing);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState('');
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [audience, setAudience] = useState<ShowcaseAudienceChoice | null>(null);
  const [reportTarget, setReportTarget] = useState<{ entryId?: string } | null>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [changed, setChanged] = useState(false);
  const dirty = useRef(false);
  const starterEntry = useRef<ReturnType<typeof newEntry> | null>(null);
  const starterPending = useRef(initialEditing);
  const operation = useRef(false);
  const loadVersion = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const reload = async (replaceDraft = false) => {
    const request = session.generation.current;
    const version = ++loadVersion.current;
    setLoading(true);
    setFailed(false);
    setUnavailable(false);
    try {
      const next = await showcaseApi.get(id);
      if (!session.current(request) || loadVersion.current !== version) return;
      setSnapshot(next);
      if (next.entries.length) starterPending.current = false;
      if (replaceDraft || !dirty.current) {
        const firstStory = starterPending.current && next.entries.length === 0;
        if (firstStory && !starterEntry.current)
          starterEntry.current = newEntry(Crypto.randomUUID(), defaultEntryKind(next.template));
        const editable = firstStory ? { ...next, entries: [starterEntry.current!] } : next;
        setDraft(editable);
        draftRef.current = editable;
        dirty.current = false;
        setChanged(false);
        setStale(false);
      } else if (draftRef.current) {
        const updated = refreshDraftMedia(draftRef.current, next);
        setDraft(updated);
        draftRef.current = updated;
        if (next.revision !== updated.revision) setStale(true);
      }
      if (next.ownerId === user?.id) {
        try {
          const choices = await showcaseApi.pickers();
          if (session.current(request) && loadVersion.current === version) setPickers(choices);
        } catch {
          if (session.current(request) && loadVersion.current === version) setFailed(true);
        }
      }
    } catch (failure) {
      if (session.current(request) && loadVersion.current === version) {
        setSnapshot(null);
        setUnavailable(
          failure instanceof Error &&
            /unavailable|not_found|42501|permission|blocked/i.test(failure.message),
        );
        setFailed(true);
      }
    } finally {
      if (session.current(request) && loadVersion.current === version) setLoading(false);
    }
  };
  const session = useShowcaseSession(
    () => {
      setBusy(operation.current);
      void reload();
    },
    () => {
      setSnapshot(null);
      setPickers(emptyPickers);
    },
  );
  useEffect(() => {
    if (!session.visible) return;
    const timer = setInterval(() => {
      if (!operation.current) void reload();
    }, 240_000);
    return () => clearInterval(timer);
  }, [session.visible]);

  const acceptSaved = (next: Showcase) => {
    starterPending.current = false;
    setSnapshot(next);
    setDraft(next);
    draftRef.current = next;
    dirty.current = false;
    setChanged(false);
    setStale(false);
  };
  const run = async (task: (request: number) => Promise<void>): Promise<boolean> => {
    if (operation.current || !session.active.current) return false;
    operation.current = true;
    const request = session.generation.current;
    setBusy(true);
    setFailed(false);
    setNotice('');
    try {
      await task(request);
      return session.current(request);
    } catch (failure) {
      if (session.current(request)) {
        setFailed(true);
        setStale(failure instanceof Error && /revision|stale|conflict/i.test(failure.message));
      }
      return false;
    } finally {
      operation.current = false;
      if (session.active.current) setBusy(false);
    }
  };
  const change = (patch: Partial<Showcase>) => {
    if (busy || !draftRef.current) return;
    const next = { ...draftRef.current, ...patch };
    setDraft(next);
    draftRef.current = next;
    dirty.current = true;
    setChanged(true);
    setNotice('');
  };
  const saveDraft = async (request: number): Promise<Showcase> => {
    const current = draftRef.current;
    if (!current || !validForSave(current)) throw new Error('invalid_showcase');
    const next = await showcaseApi.save(showcaseSaveInput(current));
    if (session.current(request)) acceptSaved(next);
    return next;
  };
  const save = () =>
    run(async (request) => {
      await saveDraft(request);
      if (session.current(request)) setNotice(c.saved);
    });
  const upload = (entryId: string, media: PendingEventMedia, caption: string) =>
    run(async (request) => {
      const saved = await saveDraft(request);
      if (!session.current(request)) return;
      await showcaseApi.upload(saved.id, entryId, media.uri, media.kind, media.mimeType, caption);
      if (session.current(request)) {
        await reload();
        if (session.current(request)) setNotice(c.queued);
      }
    });
  const publish = () =>
    run(async (request) => {
      if (!audience || !draftRef.current) return;
      const saved = dirty.current ? await saveDraft(request) : draftRef.current;
      if (!session.current(request)) return;
      const next = await showcaseApi.publish(saved.id, audience.audience, saved.revision, {
        groupId: audience.groupId,
        personIds: audience.personIds,
      });
      if (session.current(request)) {
        acceptSaved(next);
        setPublicationOpen(false);
        setNotice(c.publicationSuccess);
      }
    });
  const unpublish = () =>
    confirmAction({
      title: c.unpublishTitle,
      message: c.unpublishMessage,
      cancelLabel: c.cancel,
      confirmLabel: c.unpublish,
      onConfirm: () =>
        run(async (request) => {
          const next = await showcaseApi.unpublish(id);
          if (session.current(request)) {
            if (dirty.current && draftRef.current) {
              const retained = {
                ...refreshDraftMedia(draftRef.current, next),
                status: 'draft' as const,
                audience: null,
              };
              setSnapshot(next);
              setDraft(retained);
              draftRef.current = retained;
              setStale(retained.revision !== next.revision);
            } else acceptSaved(next);
            setPublicationOpen(false);
            setNotice(c.saved);
          }
        }).then(() => undefined),
    });
  const remove = () =>
    confirmAction({
      title: c.removeTitle,
      message: c.removeMessage,
      cancelLabel: c.cancel,
      confirmLabel: c.remove,
      destructive: true,
      onConfirm: () =>
        run(async (request) => {
          await showcaseApi.remove(id);
          if (session.current(request)) router.replace('/showcases' as Href);
        }).then(() => undefined),
    });
  const refresh = () => {
    if (busy) return;
    if (dirty.current)
      confirmAction({
        title: c.reloadTitle,
        message: c.reloadMessage,
        cancelLabel: c.cancel,
        confirmLabel: c.refresh,
        onConfirm: () => reload(true),
      });
    else void reload(true);
  };
  const leave = () => {
    const navigate = () =>
      router.canGoBack() ? router.back() : router.replace('/showcases' as Href);
    if (dirty.current)
      confirmAction({
        title: c.leaveTitle,
        message: c.leaveMessage,
        cancelLabel: c.cancel,
        confirmLabel: c.leave,
        onConfirm: navigate,
      });
    else navigate();
  };
  const report = () =>
    run(async (request) => {
      await showcaseApi.report(id, reportTarget?.entryId, reportNotes.trim());
      if (session.current(request)) {
        setReportTarget(null);
        setReportNotes('');
        setNotice(c.reportSent);
      }
    });
  const own = Boolean(user && (snapshot ?? draft)?.ownerId === user.id);
  const content = own && editing && draft ? draft : snapshot;
  const valid = draft ? validForSave(draft) : false;
  const canPublish = valid && Boolean(draft?.entries.length);
  const retainComposer = own && editing && draft !== null;
  const presentContent = retainComposer || Boolean(session.visible && snapshot);
  const hideComposer = !session.visible || !snapshot;
  const errors = failed && (
    <View style={showcaseStyles.section}>
      <ShowcaseHint alert>{stale ? c.stale : unavailable ? c.unavailable : c.failed}</ShowcaseHint>
      <Button label={c.retry} variant="secondary" disabled={busy} onPress={refresh} />
    </View>
  );
  return (
    <Screen back onBack={leave} title={content?.title ?? c.title}>
      <View style={showcaseStyles.page}>
        {errors}
        {!!notice && <ShowcaseHint>{notice}</ShowcaseHint>}
        {loading && !content && <ShowcaseHint>{c.loading}</ShowcaseHint>}
        {presentContent && content && (
          // A hidden owner composer stays mounted while a native picker is open.
          // Its result stays local, and fresh authorization is required to reveal it.
          <View
            style={[showcaseStyles.section, hideComposer ? { display: 'none' } : undefined]}
            accessibilityElementsHidden={hideComposer}
            importantForAccessibility={hideComposer ? 'no-hide-descendants' : 'auto'}
          >
            <ShowcasePanel>
              <ShowcaseHint>{c.templates[content.template]}</ShowcaseHint>
              <ShowcaseHeading>{content.title}</ShowcaseHeading>
              <ShowcaseHint>
                {c[content.status]}
                {content.audience ? ` · ${audienceDescription(content, locale, pickers)}` : ''}
              </ShowcaseHint>
              {!editing || preview
                ? !!content.introduction && <ShowcaseHint>{content.introduction}</ShowcaseHint>
                : null}
              {own && (
                <View style={showcaseStyles.split}>
                  <View style={showcaseStyles.flex}>
                    <Button
                      label={editing && !preview ? c.preview : c.edit}
                      icon={editing && !preview ? 'eye-outline' : 'create-outline'}
                      variant="secondary"
                      disabled={busy}
                      onPress={() => {
                        setEditing(true);
                        setPreview((value) => (editing ? !value : false));
                      }}
                    />
                  </View>
                  <View style={showcaseStyles.flex}>
                    <Button label={c.refresh} variant="ghost" disabled={busy} onPress={refresh} />
                  </View>
                </View>
              )}
            </ShowcasePanel>
            {own && editing && !preview && draft ? (
              <>
                <ShowcasePanel>
                  <Field
                    label={c.titleLabel}
                    value={draft.title}
                    maxLength={80}
                    editable={!busy}
                    onChangeText={(title) => change({ title })}
                  />
                  <AdvancedSection title={c.collectionOptions} disabled={busy}>
                    <Field
                      label={c.introduction}
                      value={draft.introduction}
                      maxLength={500}
                      multiline
                      editable={!busy}
                      onChangeText={(introduction) => change({ introduction })}
                    />
                    <ShowcaseHeading>{c.layout}</ShowcaseHeading>
                    <View style={showcaseStyles.row}>
                      {(['list', 'gallery'] as const).map((layout) => (
                        <ChoiceChip
                          key={layout}
                          label={c[layout]}
                          selected={draft.layout === layout}
                          onPress={() => {
                            if (!busy) change({ layout });
                          }}
                        />
                      ))}
                    </View>
                    <ChoiceChip
                      label={c.noCover}
                      selected={draft.coverMediaId === null}
                      onPress={() => {
                        if (!busy) change({ coverMediaId: null });
                      }}
                    />
                  </AdvancedSection>
                  {changed && <ShowcaseHint>{c.unsaved}</ShowcaseHint>}
                  {stale && !failed && <ShowcaseHint alert>{c.stale}</ShowcaseHint>}
                </ShowcasePanel>
                {!draft.entries.length && <ShowcaseHint>{c.emptyEntries}</ShowcaseHint>}
                {draft.entries.map((entry, index) => (
                  <ShowcaseEntryEditor
                    key={entry.id}
                    entry={entry}
                    pickers={pickers}
                    index={index}
                    last={index === draft.entries.length - 1}
                    busy={busy}
                    coverMediaId={draft.coverMediaId}
                    onChange={(patch) =>
                      change({
                        entries: draftRef.current!.entries.map((item) =>
                          item.id === entry.id ? patchEntry(item, patch) : item,
                        ),
                      })
                    }
                    onMove={(direction) =>
                      change({ entries: moveItem(draftRef.current!.entries, index, direction) })
                    }
                    onRemove={() =>
                      change({
                        entries: draftRef.current!.entries.filter((item) => item.id !== entry.id),
                        coverMediaId: entry.media.some(
                          (item) => item.id === draftRef.current!.coverMediaId,
                        )
                          ? null
                          : draftRef.current!.coverMediaId,
                      })
                    }
                    onCover={(coverMediaId) => change({ coverMediaId })}
                    onUpload={(media, caption) => upload(entry.id, media, caption)}
                  />
                ))}
                <Button
                  label={c.addEntry}
                  icon="add-circle-outline"
                  variant="secondary"
                  disabled={busy || draft.entries.length >= 50}
                  onPress={() =>
                    change({
                      entries: [
                        ...draftRef.current!.entries,
                        newEntry(Crypto.randomUUID(), defaultEntryKind(draft.template)),
                      ],
                    })
                  }
                />
                {!valid && <ShowcaseHint>{c.validationHint}</ShowcaseHint>}
                <Button
                  label={c.save}
                  disabled={!valid || stale}
                  loading={busy}
                  onPress={() => void save()}
                />
              </>
            ) : (
              <View
                style={
                  content.layout === 'gallery' ? showcaseStyles.gallery : showcaseStyles.section
                }
              >
                {content.entries.map((entry) => (
                  <View
                    key={entry.id}
                    style={content.layout === 'gallery' ? showcaseStyles.galleryItem : undefined}
                  >
                    <ShowcaseEntryView
                      entry={entry}
                      owner={own}
                      onReport={
                        !own
                          ? () => {
                              setReportNotes('');
                              setReportTarget({ entryId: entry.id });
                            }
                          : undefined
                      }
                    />
                  </View>
                ))}
                {!content.entries.length && <ShowcaseHint>{c.emptyEntries}</ShowcaseHint>}
              </View>
            )}
            {own && (
              <ShowcasePanel>
                <ShowcaseHint>{c.publicationHint}</ShowcaseHint>
                <Button
                  label={c.publish}
                  disabled={busy || !canPublish || stale}
                  onPress={() => {
                    setAudience(null);
                    setPublicationOpen(true);
                  }}
                />
                {publicationOpen && canPublish && (
                  <ShowcaseAudiencePicker
                    choice={audience}
                    onChange={setAudience}
                    pickers={pickers}
                    busy={busy}
                    onConfirm={() => void publish()}
                    onCancel={() => setPublicationOpen(false)}
                  />
                )}
                <AdvancedSection title={c.explainMore}>
                  <ShowcaseHint>{c.consentHint}</ShowcaseHint>
                  <ShowcaseHint>{c.groupHint}</ShowcaseHint>
                  <ShowcaseHint>{c.reuseHint}</ShowcaseHint>
                </AdvancedSection>
                {snapshot?.status === 'published' && (
                  <Button
                    label={c.unpublish}
                    variant="secondary"
                    disabled={busy}
                    onPress={unpublish}
                  />
                )}
                <Button
                  label={c.remove}
                  icon="trash-outline"
                  variant="ghost"
                  disabled={busy}
                  onPress={remove}
                />
              </ShowcasePanel>
            )}
            {!own && (
              <Button
                label={c.report}
                icon="flag-outline"
                variant="ghost"
                onPress={() => {
                  setReportNotes('');
                  setReportTarget({});
                }}
              />
            )}
            {reportTarget && (
              <ShowcasePanel>
                <ShowcaseHeading>{reportTarget.entryId ? c.reportEntry : c.report}</ShowcaseHeading>
                <Field
                  label={c.reportNotes}
                  value={reportNotes}
                  onChangeText={setReportNotes}
                  multiline
                  maxLength={2000}
                  editable={!busy}
                />
                <Button label={c.sendReport} loading={busy} onPress={() => void report()} />
                <Button
                  label={c.cancel}
                  variant="ghost"
                  disabled={busy}
                  onPress={() => setReportTarget(null)}
                />
              </ShowcasePanel>
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}
