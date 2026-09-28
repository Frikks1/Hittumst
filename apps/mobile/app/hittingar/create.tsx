import { communityApi } from '@/services/community';
import { ApplicationQuestions } from '@/features/hittingar/CommunityPanels';
import { SponsorshipForm, type SponsorshipSelection } from '@/features/hittingar/SponsorshipForm';
import { PoolSummary } from '@/features/hittingar/PoolSummary';
import { defaultMeetupEventProfile, type MeetupSummary, type FinanceCommand } from '@rummal/shared';
import { EventProfileFields } from '@/features/hittingar/EventProfileFields';
import { EventMediaGallery, type PendingEventMedia } from '@/features/hittingar/EventMedia';
import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Button, ChoiceChip, Field, Screen, textStyles } from '@/components/ui';
import { SafetyNotice } from '@/features/hittingar/components';
import {
  clearHittingarLocalDraft,
  getHittingarLocalDraft,
  setHittingarLocalDraft,
} from '@/features/hittingar/draftStorage';
import HittingurLocationPicker from '@/features/hittingar/HittingurLocationPicker';
import {
  generalAreaKey,
  HITTINGUR_CATEGORIES,
  HITTINGUR_GENERAL_AREAS,
  HITTINGUR_INTENTIONS,
  HITTINGUR_TAGS,
  HITTINGUR_VENUE_MODES,
  initialCreateHittingurForm,
  reykjavikLocalToUtc,
  tagKey,
  type CreateHittingurForm,
  utcToReykjavikFields,
  validateCreateStep,
} from '@/features/hittingar/model';
import type { TranslationKey } from '@/i18n/translations';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import type { GeoCoordinate, MeetupDraftInput, MeetupPlaceResult } from '@/types/domain';

type CreateParams = { id?: string };
type StoredDraft = { form: CreateHittingurForm; draftId: string | null; savedAt: string };

const meetupApi = api as RummalApi;

function draftInput(form: CreateHittingurForm): MeetupDraftInput {
  const startsAt = reykjavikLocalToUtc(form.startDate, form.startTime);
  const hasEnd = Boolean(form.endDate || form.endTime);
  const endsAt = hasEnd ? reykjavikLocalToUtc(form.endDate, form.endTime) : null;
  const onlineOnly = form.venueMode === 'online';
  if (!startsAt || (hasEnd && !endsAt) || (!onlineOnly && (!form.generalAreaId || form.latitude === null || form.longitude === null))) {
    throw new Error('Incomplete meetup draft');
  }
  const recurrence = form.recurring ? {
    frequency: form.recurrenceFrequency,
    interval: Number(form.recurrenceInterval),
    weekdays: form.recurrenceFrequency === 'weekly' ? form.recurrenceWeekdays : [],
    ...(form.recurrenceFrequency === 'monthly'
      ? { monthlyPattern: { kind: 'day_of_month' as const, day: Number(form.startDate.slice(8, 10)) } }
      : {}),
    skippedDates: [],
    end: form.recurrenceEndType === 'count'
      ? { kind: 'count' as const, count: Number(form.recurrenceCount) }
      : { kind: 'date' as const, date: form.recurrenceEndDate },
    timezone: 'Atlantic/Reykjavik' as const,
  } : null;
  return {
    eventProfile: form.eventProfile,
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category,
    intention: form.intention,
    venueMode: form.venueMode,
    tags: form.tags,
    startsAt,
    endsAt,
    accessMode: form.eventProfile.joinMode === 'request' ? 'private' : 'open',
    locationVisibility: form.locationVisibility,
    releasePolicy: form.locationVisibility === 'public' ? 'immediate' : form.releasePolicy,
    generalAreaId: form.generalAreaId ?? 'reykjavik',
    capacity: form.capacity ? Number(form.capacity) : null,
    isExplicit: form.isExplicit,
    rsvpVisibility: 'private',
    onlineUrl: form.venueMode === 'in_person' ? undefined : form.onlineUrl.trim(),
    onlineAccessCode: form.venueMode === 'in_person' ? undefined : form.onlineAccessCode.trim() || undefined,
    recurrence,
    prohibitedServicesAttested: form.prohibitedServicesAttested,
    publicLocationConfirmed: form.publicLocationConfirmed,
    latitude: form.latitude ?? 64.1466,
    longitude: form.longitude ?? -21.9426,
    venueName: form.venueName.trim() || undefined,
    address: onlineOnly ? undefined : form.address.trim() || undefined,
    arrivalInstructions: form.arrivalInstructions.trim() || undefined,
  };
}

function formFromPlace(form: CreateHittingurForm, place: MeetupPlaceResult): CreateHittingurForm {
  return {
    ...form,
    generalAreaId: place.generalAreaId ?? form.generalAreaId,
    venueName: place.name,
    address: place.fullAddress ?? '',
    latitude: place.coordinate.latitude,
    longitude: place.coordinate.longitude,
    publicLocationConfirmed: false,
  };
}

export default function CreateHittingurScreen() {
  const { id: editingId } = useLocalSearchParams<CreateParams>();
  const router = useRouter();
  const { locale, t, theme, user } = useApp();
  const [pendingPublication, setPendingPublication] = useState<Extract<FinanceCommand, { action: 'publish_sponsored' }> | null>(null);
  const [sponsoring, setSponsoring] = useState(false);
  const [sponsorship, setSponsorship] = useState<SponsorshipSelection | null>(null);
  const [published, setPublished] = useState(false);
  const [pool, setPool] = useState<MeetupSummary['pool']>({ hostBps: 2500, locked: false, total: 0, fundedTotal: 0, paidTotal: 0, refundedTotal: 0, status: 'accepting', estimatedParticipantReward: null, eligibleParticipantCount: 0 });
  const [step, setStep] = useState(0);
  const stage = [2, 0, 1, 3][step] ?? 2;
  useEffect(() => { setSponsorship(null); }, [step]);
  const [pendingMedia, setPendingMedia] = useState<PendingEventMedia[]>([]);
  const [form, setForm] = useState<CreateHittingurForm>(initialCreateHittingurForm);
  const [draftId, setDraftId] = useState<string | null>(editingId ?? null);
  const draftIdRef = useRef<string | null>(editingId ?? null);
  const [errors, setErrors] = useState<TranslationKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState<MeetupPlaceResult[]>([]);
  const [restored, setRestored] = useState(Boolean(editingId));
  const localDraftOwnerId = editingId ? null : user?.id ?? null;

  useEffect(() => {
    let active = true;
    void meetupApi.getPendingFinanceCommand().then(command => { if (active && command?.action === 'publish_sponsored') setPendingPublication(command); }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  const resumePublication = async () => {
    if (!pendingPublication || saving) return;
    setSaving(true);
    try {
      await meetupApi.publishMeetup(pendingPublication.meetupId, pendingPublication);
      if (localDraftOwnerId && pendingPublication.meetupId === draftIdRef.current) await clearHittingarLocalDraft(localDraftOwnerId);
      router.replace(`/hittingar/${pendingPublication.meetupId}` as Href);
    } catch {
      const command = await meetupApi.getPendingFinanceCommand().catch(() => null);
      setPendingPublication(command?.action === 'publish_sponsored' ? command : null);
      setErrors(['event.error']);
    } finally { setSaving(false); }
  };

  const update = <K extends keyof CreateHittingurForm>(key: K, value: CreateHittingurForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  useEffect(() => {
    let active = true;
    if (editingId) {
      void Promise.all([meetupApi.getMeetup(editingId), communityApi.getState(editingId)]).then(([detail, community]) => {
        if (!active) return;
        setPool(detail.pool);
        setPublished(detail.status !== 'draft');
        const start = utcToReykjavikFields(detail.startsAt);
        const end = utcToReykjavikFields(detail.endsAt);
        const exact = detail.location.state === 'public' || detail.location.state === 'protected_revealed'
          ? detail.location.exactLocation
          : null;
        setForm({
          eventProfile: detail.eventProfile ?? defaultMeetupEventProfile(detail.accessMode),
          applicationQuestions: community.applicationQuestions,
          title: detail.title,
          description: detail.description,
          category: detail.category,
          intention: detail.intention,
          venueMode: detail.venueMode,
          tags: detail.tags,
          startDate: start.date,
          startTime: start.time,
          endDate: end.date,
          endTime: end.time,
          generalAreaId: detail.generalAreaId,
          venueName: exact?.venueName ?? '',
          address: exact?.address ?? '',
          latitude: exact?.latitude ?? detail.location.marker.latitude,
          longitude: exact?.longitude ?? detail.location.marker.longitude,
          arrivalInstructions: detail.location.state === 'public' || detail.location.state === 'protected_revealed'
            ? detail.location.arrivalInstructions ?? ''
            : '',
          accessMode: detail.accessMode,
          locationVisibility: detail.locationVisibility,
          capacity: detail.capacity ? String(detail.capacity) : '',
          isExplicit: detail.isExplicit,
          releasePolicy: detail.releasePolicy,
          publicLocationConfirmed: detail.locationVisibility === 'public',
          prohibitedServicesAttested: false,
          rsvpVisibility: 'private',
          onlineUrl: detail.onlineAccess.state === 'revealed' ? detail.onlineAccess.url : '',
          onlineAccessCode: detail.onlineAccess.state === 'revealed' ? detail.onlineAccess.accessCode ?? '' : '',
          recurring: detail.recurrence !== null,
          recurrenceFrequency: detail.recurrence?.frequency ?? 'weekly',
          recurrenceInterval: String(detail.recurrence?.interval ?? 1),
          recurrenceWeekdays: detail.recurrence?.weekdays ?? [],
          recurrenceEndType: detail.recurrence?.end.kind ?? 'count',
          recurrenceCount: detail.recurrence?.end.kind === 'count' ? String(detail.recurrence.end.count) : '4',
          recurrenceEndDate: detail.recurrence?.end.kind === 'date' ? detail.recurrence.end.date : '',
        });
        setRestored(true);
      }).catch(() => setRestored(true));
      return () => { active = false; };
    }
    if (!localDraftOwnerId) {
      setRestored(true);
      return () => { active = false; };
    }
    void getHittingarLocalDraft(localDraftOwnerId).then((raw) => {
      if (!active || !raw) return;
      const stored = JSON.parse(raw) as StoredDraft;
      if (stored.form) setForm({ ...initialCreateHittingurForm, ...stored.form });
      if (stored.draftId) setDraftId(stored.draftId);
    }).finally(() => { if (active) setRestored(true); });
    return () => { active = false; };
  }, [editingId, localDraftOwnerId]);

  const persist = useCallback(async (nextForm: CreateHittingurForm, syncServer: boolean) => {
    setSaveStatus('saving');
    try {
      if (localDraftOwnerId) {
        await setHittingarLocalDraft(localDraftOwnerId, JSON.stringify({ form: nextForm, draftId: draftIdRef.current, savedAt: new Date().toISOString() } satisfies StoredDraft));
      }
      if (syncServer) {
        const input = draftInput(nextForm);
        if (draftIdRef.current) {
          await meetupApi.updateMeetup(draftIdRef.current, input);
        } else {
          const newId = await meetupApi.createMeetupDraft(input);
          draftIdRef.current = newId;
          setDraftId(newId);
          if (localDraftOwnerId) {
            await setHittingarLocalDraft(localDraftOwnerId, JSON.stringify({ form: nextForm, draftId: newId, savedAt: new Date().toISOString() } satisfies StoredDraft));
          }
        }
      }
      setSaveStatus('saved');
      return true;
    } catch {
      setSaveStatus('error');
      return false;
    }
  }, [localDraftOwnerId]);

  const basicsComplete = true;

  useEffect(() => {
    if (!restored || !basicsComplete) return;
    const timer = setTimeout(() => void persist(form, false), 650);
    return () => clearTimeout(timer);
  }, [basicsComplete, form, persist, restored, step]);

  const stepErrors = useMemo(() => validateCreateStep(stage, form), [form, stage]);
  const next = async () => {
    const nextErrors = validateCreateStep(stage, form);
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;
    await persist(form, false);
    setStep((value) => Math.min(value + 1, 3));
  };

  const searchPlaces = async () => {
    if (search.trim().length < 2) return;
    setSearching(true);
    try {
      setPlaces(await meetupApi.searchMeetupPlaces(search.trim(), { locale, limit: 6 }));
    } finally {
      setSearching(false);
    }
  };

  const selectPlace = (place: MeetupPlaceResult) => {
    setForm((current) => formFromPlace(current, place));
    setSearch(place.name);
    setPlaces([]);
  };

  const selectPin = async (coordinate: GeoCoordinate) => {
    setForm((current) => ({ ...current, ...coordinate, publicLocationConfirmed: false }));
    try {
      const place = await meetupApi.reverseGeocodeMeetupPlace(coordinate, { locale, limit: 1 });
      if (place) {
        setForm((current) => formFromPlace(current, place));
        setSearch(place.name);
      }
    } catch {
      // The chosen coordinate remains usable when reverse geocoding is unavailable.
    }
  };

  const prepareSponsorship = async () => {
    const nextErrors = [0, 1, 2, 3].flatMap(value => validateCreateStep(value, form));
    setErrors(nextErrors);
    if (nextErrors.length > 0 || !await persist(form, true) || !draftIdRef.current) throw new Error('event_save_failed');
    return draftIdRef.current;
  };

  const save = async (publish: boolean) => {
    if (saving || pendingPublication || (publish && sponsoring && !sponsorship)) return;
    const allErrors = [0, 1, 2, 3].flatMap((value) => validateCreateStep(value, form));
    setErrors(allErrors);
    if (allErrors.length > 0) return;
    setSaving(true);
    try {
      if (!await persist(form, true)) throw new Error('event_save_failed');
      const id = draftIdRef.current;
      if (!id) throw new Error('Draft id missing');
      await communityApi.setQuestions(id, form.applicationQuestions.map(value => value.trim()).filter(Boolean));
      for (const item of pendingMedia) {
        const mediaId = await meetupApi.uploadMeetupMedia(id, item.uri, item.kind, item.mimeType);
        if (item.isCover && typeof mediaId === 'string') await communityApi.setCover(id, mediaId);
        setPendingMedia(current => current.filter(value => value !== item));
      }
      if (publish) {
        await meetupApi.publishMeetup(id, sponsoring && sponsorship ? { quoteId: sponsorship.quote.id, amount: sponsorship.quote.amount, expectedHostBps: sponsorship.quote.hostBps, requestId: sponsorship.requestId } : undefined);
        if (localDraftOwnerId) await clearHittingarLocalDraft(localDraftOwnerId);
        router.replace(`/hittingar/${id}` as Href);
      } else {
        if (localDraftOwnerId) await clearHittingarLocalDraft(localDraftOwnerId);
        router.replace('/hittingar/mine' as Href);
      }
    } catch {
      const command = await meetupApi.getPendingFinanceCommand().catch(() => null);
      setPendingPublication(command?.action === 'publish_sponsored' ? command : null);
      setErrors(['event.error']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen back title={t(editingId ? 'hittingar.create.editTitle' : 'hittingar.create.title')}>
      <View style={styles.page}>
        {pendingPublication && <View style={{ gap: 10, padding: 14, backgroundColor: theme.colors.surface, borderRadius: 16 }}><Text accessibilityRole="alert" style={{ color: theme.colors.text }}>{locale === 'is' ? 'Birting með styrk bíður staðfestingar. Uppkastið er vistað. Athugaðu sömu aðgerð áður en þú birtir aftur.' : 'Sponsored publication is awaiting confirmation. Your draft is saved. Check the same request before publishing again.'}</Text><Button disabled={saving} label={locale === 'is' ? 'Athuga stöðu birtingar' : 'Check publication status'} onPress={() => void resumePublication()} /></View>}
        <View style={styles.steps} accessibilityLabel={t('hittingar.create.progress', { step: step + 1 })}>
          {[0, 1, 2, 3].map((value) => <View key={value} style={[styles.step, { backgroundColor: value <= step ? theme.colors.accent : theme.colors.surfaceMuted }]} />)}
        </View>
        <View style={styles.saveRow}>
          <Text style={[textStyles.eyebrow, { color: theme.colors.accent }]}>{t('hittingar.create.stepLabel', { step: step + 1 })}</Text>
          {saveStatus !== 'idle' && <Text accessibilityLiveRegion="polite" style={[styles.saveStatus, { color: saveStatus === 'error' ? theme.colors.danger : theme.colors.textMuted }]}>{t(`hittingar.create.saveStatus.${saveStatus}`)}</Text>}
        </View>
        <Text style={[textStyles.title, { color: theme.colors.text }]}>{t(`hittingar.create.step${stage + 1}Title` as TranslationKey)}</Text>
        <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t(`hittingar.create.step${stage + 1}Body` as TranslationKey)}</Text>

        {stage === 0 && (
          <View style={styles.form}>
            <EventMediaGallery id={draftId} editable pending={pendingMedia} onPendingChange={setPendingMedia} />
            <Field label={t('hittingar.create.titleLabel')} value={form.title} onChangeText={(value) => update('title', value)} placeholder={t('hittingar.create.titlePlaceholder')} />
            <Field label={t('hittingar.create.descriptionLabel')} value={form.description} onChangeText={(value) => update('description', value)} multiline placeholder={t('hittingar.create.descriptionPlaceholder')} />
            <EventProfileFields value={form.eventProfile} onChange={value => update('eventProfile', value)} section="information" />
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.intentionLabel')}</Text>
            <View style={styles.wrap}>{HITTINGUR_INTENTIONS.map((value) => <ChoiceChip key={value} label={t(`hittingar.intention.${value}` as TranslationKey)} selected={form.intention === value} onPress={() => setForm((current) => ({ ...current, intention: value, isExplicit: false }))} />)}</View>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.categoryLabel')}</Text>
            <View style={styles.wrap}>{HITTINGUR_CATEGORIES.map((value) => <ChoiceChip key={value} label={t(`hittingar.category.${value}`)} selected={form.category === value} onPress={() => setForm((current) => ({ ...current, category: value, isExplicit: false }))} />)}</View>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.tagsLabel')}</Text>
            <Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.tagsPlaceholder')}</Text>
            <View style={styles.wrap}>{HITTINGUR_TAGS.map((value) => {
              const selected = form.tags.includes(value);
              return (
                <ChoiceChip
                  key={value}
                  label={t(tagKey(value))}
                  selected={selected}
                  onPress={() => setForm((current) => ({
                    ...current,
                    tags: selected
                      ? current.tags.filter((tag) => tag !== value)
                      : current.tags.length < 12 ? [...current.tags, value] : current.tags,
                  }))}
                />
              );
            })}</View>
          </View>
        )}

        {stage === 1 && (
          <View style={styles.form}>
            <View style={styles.twoColumns}>
              <View style={styles.flex}><Field label={t('hittingar.create.startDateLabel')} value={form.startDate} onChangeText={(value) => update('startDate', value)} placeholder={t('hittingar.create.datePlaceholder')} /></View>
              <View style={styles.flex}><Field label={t('hittingar.create.startTimeLabel')} value={form.startTime} onChangeText={(value) => update('startTime', value)} placeholder={t('hittingar.create.timePlaceholder')} /></View>
            </View>
            <View style={styles.twoColumns}>
              <View style={styles.flex}><Field label={t('hittingar.create.endDateLabel')} value={form.endDate} onChangeText={(value) => update('endDate', value)} placeholder={t('hittingar.create.optionalDatePlaceholder')} /></View>
              <View style={styles.flex}><Field label={t('hittingar.create.endTimeLabel')} value={form.endTime} onChangeText={(value) => update('endTime', value)} placeholder={t('hittingar.create.optionalTimePlaceholder')} /></View>
            </View>
            <SafetyNotice title={t('hittingar.create.timezoneTitle')} tone="accent"><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.timezoneBody')}</Text></SafetyNotice>
            <Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.defaultDuration')}</Text>
            <View style={[styles.switchRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.colors.text }]}>{t('hittingar.create.recurringTitle')}</Text><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.recurringBody')}</Text></View>
              <Switch value={form.recurring} onValueChange={(value) => update('recurring', value)} trackColor={{ true: theme.colors.accent }} />
            </View>
            {form.recurring && <>
              <View style={styles.wrap}>{(['daily', 'weekly', 'monthly'] as const).map((value) => <ChoiceChip key={value} label={t(`hittingar.recurrence.${value}` as TranslationKey)} selected={form.recurrenceFrequency === value} onPress={() => update('recurrenceFrequency', value)} />)}</View>
              <Field label={t('hittingar.create.recurrenceInterval')} value={form.recurrenceInterval} onChangeText={(value) => update('recurrenceInterval', value)} keyboardType="number-pad" />
              {form.recurrenceFrequency === 'weekly' && <View style={styles.wrap}>{[1,2,3,4,5,6,0].map((day) => <ChoiceChip key={day} label={t(`hittingar.weekday.${day}` as TranslationKey)} selected={form.recurrenceWeekdays.includes(day)} onPress={() => update('recurrenceWeekdays', form.recurrenceWeekdays.includes(day) ? form.recurrenceWeekdays.filter((item) => item !== day) : [...form.recurrenceWeekdays, day])} />)}</View>}
              <View style={styles.wrap}>
                <ChoiceChip label={t('hittingar.create.endByCount')} selected={form.recurrenceEndType === 'count'} onPress={() => update('recurrenceEndType', 'count')} />
                <ChoiceChip label={t('hittingar.create.endByDate')} selected={form.recurrenceEndType === 'date'} onPress={() => update('recurrenceEndType', 'date')} />
              </View>
              {form.recurrenceEndType === 'count'
                ? <Field label={t('hittingar.create.occurrenceCount')} value={form.recurrenceCount} onChangeText={(value) => update('recurrenceCount', value)} keyboardType="number-pad" />
                : <Field label={t('hittingar.create.recurrenceEndDate')} value={form.recurrenceEndDate} onChangeText={(value) => update('recurrenceEndDate', value)} placeholder={t('hittingar.create.datePlaceholder')} />}
            </>}
          </View>
        )}

        {stage === 2 && (
          <View style={styles.form}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.venueModeLabel')}</Text>
            <View style={styles.wrap}>{HITTINGUR_VENUE_MODES.map((value) => <ChoiceChip key={value} label={t(`hittingar.venue.${value}` as TranslationKey)} selected={form.venueMode === value} onPress={() => update('venueMode', value)} />)}</View>
            {form.venueMode !== 'in_person' && <>
              <Field label={t('hittingar.create.onlineUrl')} value={form.onlineUrl} onChangeText={(value) => update('onlineUrl', value)} placeholder="https://" />
              <Field label={t('hittingar.create.onlineCode')} value={form.onlineAccessCode} onChangeText={(value) => update('onlineAccessCode', value)} />
              <SafetyNotice title={t('hittingar.create.onlineProtectedTitle')}><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.onlineProtectedBody')}</Text></SafetyNotice>
            </>}
            {form.venueMode !== 'online' && <>
            <Field label={t('hittingar.create.searchLabel')} value={search} onChangeText={setSearch} placeholder={t('hittingar.create.searchPlaceholder')} />
            <Button label={t('hittingar.create.searchAction')} icon="search-outline" variant="secondary" loading={searching} disabled={search.trim().length < 2} onPress={() => void searchPlaces()} />
            {places.map((place) => (
              <Pressable key={place.id} accessibilityRole="button" onPress={() => selectPlace(place)} style={[styles.place, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Ionicons name="location-outline" size={21} color={theme.colors.accent} />
                <View style={styles.switchCopy}><Text style={[styles.placeTitle, { color: theme.colors.text }]}>{place.name}</Text><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{place.fullAddress ?? place.generalArea}</Text></View>
              </Pressable>
            ))}
            <HittingurLocationPicker value={form.latitude === null || form.longitude === null ? null : { latitude: form.latitude, longitude: form.longitude }} onChange={(value) => void selectPin(value)} />
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.generalAreaLabel')}</Text>
            <View style={styles.wrap}>{HITTINGUR_GENERAL_AREAS.map((value) => <ChoiceChip key={value} label={t(generalAreaKey(value))} selected={form.generalAreaId === value} onPress={() => update('generalAreaId', value)} />)}</View>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.visibilityLabel')}</Text>
            <View style={styles.wrap}>
              <ChoiceChip label={t('hittingar.location.protected')} selected={form.locationVisibility === 'protected'} onPress={() => setForm((current) => ({ ...current, locationVisibility: 'protected', publicLocationConfirmed: false }))} />
              <ChoiceChip label={t('hittingar.location.public')} selected={form.locationVisibility === 'public'} onPress={() => setForm((current) => ({ ...current, locationVisibility: 'public', publicLocationConfirmed: false }))} />
            </View>
            {form.locationVisibility === 'protected' ? (
              <SafetyNotice title={t('hittingar.location.protectedDefaultTitle')}><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.location.protectedDefaultBody')}</Text></SafetyNotice>
            ) : (
              <View style={[styles.confirm, { borderColor: theme.colors.danger, backgroundColor: theme.colors.surface }]}>
                <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.colors.text }]}>{t('hittingar.location.publicConfirmTitle')}</Text><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.location.publicConfirmBody')}</Text></View>
                <Switch value={form.publicLocationConfirmed} onValueChange={(value) => update('publicLocationConfirmed', value)} trackColor={{ true: theme.colors.danger }} />
              </View>
            )}
            <Field label={t('hittingar.create.instructionsLabel')} value={form.arrivalInstructions} onChangeText={(value) => update('arrivalInstructions', value)} multiline placeholder={t('hittingar.create.instructionsPlaceholder')} />
            </>}
          </View>
        )}

        {stage === 3 && (
          <View style={styles.form}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.accessLabel')}</Text>
            <EventProfileFields value={form.eventProfile} onChange={value => setForm(current => ({ ...current, eventProfile: value, accessMode: value.joinMode === 'request' ? 'private' : 'open' }))} section="admission" />
            {form.eventProfile.joinMode === 'request' && <ApplicationQuestions value={form.applicationQuestions} onChange={value => update('applicationQuestions', value)} />}
            {form.locationVisibility === 'protected' && form.eventProfile.joinMode === 'public' && <SafetyNotice title={t('hittingar.location.openProtectedTitle')} tone="danger"><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.location.openProtectedBody')}</Text></SafetyNotice>}
            {form.locationVisibility === 'protected' && (
              <>
                <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.releaseLabel')}</Text>
                <View style={styles.wrap}>
                  <ChoiceChip label={t('hittingar.create.release24')} selected={form.releasePolicy === '24_hours_before'} onPress={() => update('releasePolicy', '24_hours_before')} />
                  <ChoiceChip label={t('hittingar.create.releaseImmediate')} selected={form.releasePolicy === 'immediate'} onPress={() => update('releasePolicy', 'immediate')} />
                </View>
              </>
            )}
            <Field label={t('hittingar.create.capacityLabel')} value={form.capacity} onChangeText={(value) => update('capacity', value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={t('hittingar.create.capacityPlaceholder')} />
            <View style={[styles.review, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[textStyles.heading, { color: theme.colors.text }]}>{form.title}</Text>
              <Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{form.startDate} {form.startTime} · {form.generalAreaId ? t(generalAreaKey(form.generalAreaId)) : ''}</Text>
              <Text style={[styles.reviewLine, { color: theme.colors.text }]}>{t(`event.${form.eventProfile.joinMode}`)} · {t(`hittingar.location.${form.locationVisibility}`)}</Text>
              {form.isExplicit && <Text style={[styles.reviewLine, { color: theme.colors.danger }]}>18+ · {t('hittingar.create.explicitTitle')}</Text>}
            </View>
            <PoolSummary pool={pool} />
            {!published && <>
              <View style={[styles.switchRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}><View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.colors.text }]}>{locale === 'is' ? 'Styrkja eigin hitting' : 'Sponsor your own meetup'}</Text><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{locale === 'is' ? 'Valfrjáls styrkur bætir hvata fyrir þátttakendur. Birtist í sjóðnum eftir staðfesta birtingu.' : 'Add an optional reward for attendees. It appears in the funded pool after publication is confirmed.'}</Text></View><Switch accessibilityLabel={locale === 'is' ? 'Styrkja eigin hitting' : 'Sponsor your own meetup'} disabled={saving} value={sponsoring} onValueChange={value => { setSponsoring(value); setSponsorship(null); }} trackColor={{ true: theme.colors.accent }} /></View>
              {sponsoring && <SponsorshipForm prepareMeetup={prepareSponsorship} deferConfirmation disabled={saving} onSelectionChange={setSponsorship} />}
            </>}
            <SafetyNotice title={t('hittingar.create.reviewSafetyTitle')} tone="accent"><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.reviewSafetyBody')}</Text></SafetyNotice>
            <View style={[styles.confirm, { borderColor: theme.colors.warning, backgroundColor: theme.colors.surface }]}>
              <View style={styles.switchCopy}>
                <Text style={[styles.switchTitle, { color: theme.colors.text }]}>{t('hittingar.create.attestationTitle')}</Text>
                <Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.attestationBody')}</Text>
              </View>
              <Switch
                accessibilityLabel={t('hittingar.create.attestationTitle')}
                value={form.prohibitedServicesAttested}
                onValueChange={(value) => update('prohibitedServicesAttested', value)}
                trackColor={{ true: theme.colors.accent }}
              />
            </View>
          </View>
        )}

        {errors.length > 0 && <View style={[styles.errors, { backgroundColor: theme.colors.surface }]}>{errors.map((key) => <Text key={key} style={[styles.errorText, { color: theme.colors.danger }]}>• {t(key)}</Text>)}</View>}
        <View style={styles.actions}>
          {step > 0 && <View style={styles.flex}><Button label={t('common.back')} variant="secondary" onPress={() => { setErrors([]); setStep((value) => value - 1); }} /></View>}
          {step < 3 ? <View style={styles.flex}><Button label={t('common.continue')} disabled={stepErrors.length > 0} onPress={() => void next()} /></View> : (
            <>
              <View style={styles.flex}><Button label={t('hittingar.create.saveDraft')} variant="secondary" loading={saving} onPress={() => void save(false)} /></View>
              <View style={styles.flex}><Button label={sponsoring ? (locale === 'is' ? 'Birta og styrkja' : 'Publish and sponsor') : t(editingId ? 'hittingar.create.saveChanges' : 'hittingar.create.publish')} disabled={Boolean(pendingPublication) || (sponsoring && !sponsorship)} loading={saving} onPress={() => void save(true)} /></View>
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 42, gap: 12 },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 5, borderRadius: 3 },
  saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  saveStatus: { fontSize: 11, fontWeight: '700' },
  form: { gap: 15, marginTop: 8 },
  fieldLabel: { fontSize: 14, fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  switchRow: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1, gap: 3 },
  switchTitle: { fontSize: 15, fontWeight: '800' },
  switchBody: { fontSize: 13, lineHeight: 19 },
  place: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  placeTitle: { fontSize: 14, fontWeight: '800' },
  confirm: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  review: { borderWidth: 1, borderRadius: 20, padding: 17, gap: 7 },
  reviewLine: { fontSize: 13, fontWeight: '800' },
  errors: { borderRadius: 15, padding: 13, gap: 4, marginTop: 4 },
  errorText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 8 },
  flex: { flex: 1 },
});
