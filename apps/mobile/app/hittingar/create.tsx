import { communityApi } from '@/services/community';
import { ApplicationQuestions } from '@/features/hittingar/CommunityPanels';
import { defaultMeetupEventProfile } from '@rummal/shared';
import { EventProfileFields } from '@/features/hittingar/EventProfileFields';
import { EventMediaGallery, type PendingEventMedia } from '@/features/hittingar/EventMedia';
import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Button, ChoiceChip, Field, textStyles } from '@/components/ui';
import HittingurStartFields from '@/features/hittingar/HittingurStartFields';
import { HittingurCreationWindow } from '@/features/hittingar/HittingurCreationWindow';
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
  HITTINGUR_VENUE_MODES,
  initialCreateHittingurForm,
  meetupFeeLabel,
  reykjavikLocalToUtc,
  type CreateHittingurForm,
  utcToReykjavikFields,
  validateCreateHittingur,
  validateCreateStep,
} from '@/features/hittingar/model';
import type { TranslationKey } from '@/i18n/translations';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import type { GeoCoordinate, MeetupDraftInput, MeetupPlaceResult } from '@/types/domain';

type CreateParams = { id?: string };
type StoredDraft = {
  form: CreateHittingurForm;
  draftId: string | null;
  savedAt: string;
  pendingMedia?: PendingEventMedia[];
};

const meetupApi = api as RummalApi;

function draftInput(form: CreateHittingurForm): MeetupDraftInput {
  const startsAt = reykjavikLocalToUtc(form.startDate, form.startTime);
  const hasEnd = Boolean(form.endDate || form.endTime);
  const endsAt = hasEnd ? reykjavikLocalToUtc(form.endDate, form.endTime) : null;
  const onlineOnly = form.venueMode === 'online';
  if (
    !startsAt ||
    (hasEnd && !endsAt) ||
    (!onlineOnly && (!form.generalAreaId || form.latitude === null || form.longitude === null))
  ) {
    throw new Error('Incomplete meetup draft');
  }
  const recurrence = form.recurring
    ? {
        frequency: form.recurrenceFrequency,
        interval: Number(form.recurrenceInterval),
        weekdays: form.recurrenceFrequency === 'weekly' ? form.recurrenceWeekdays : [],
        ...(form.recurrenceFrequency === 'monthly'
          ? {
              monthlyPattern: {
                kind: 'day_of_month' as const,
                day: Number(form.startDate.slice(8, 10)),
              },
            }
          : {}),
        skippedDates: [],
        end:
          form.recurrenceEndType === 'count'
            ? { kind: 'count' as const, count: Number(form.recurrenceCount) }
            : { kind: 'date' as const, date: form.recurrenceEndDate },
        timezone: 'Atlantic/Reykjavik' as const,
      }
    : null;
  return {
    ...(!form.preserveLegacyFee ? { feeIsk: Number(form.feeIsk || 0) } : {}),
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
    onlineAccessCode:
      form.venueMode === 'in_person' ? undefined : form.onlineAccessCode.trim() || undefined,
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
    generalAreaId: place.generalAreaId ?? null,
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
  const [published, setPublished] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [step, setStep] = useState(0);
  const [legacyFee, setLegacyFee] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showAreas, setShowAreas] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingEventMedia[]>([]);
  const [mediaRevision, setMediaRevision] = useState(0);
  const pendingMediaRef = useRef(pendingMedia);
  pendingMediaRef.current = pendingMedia;
  const locationLookupRef = useRef(0);
  const [form, setForm] = useState<CreateHittingurForm>(initialCreateHittingurForm);
  const [draftId, setDraftId] = useState<string | null>(editingId ?? null);
  const draftIdRef = useRef<string | null>(editingId ?? null);
  const [errors, setErrors] = useState<TranslationKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<'empty' | 'error' | null>(null);
  const [places, setPlaces] = useState<MeetupPlaceResult[]>([]);
  const [restored, setRestored] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const localDraftOwnerId = user?.id
    ? editingId
      ? `${user.id}.meetup.${editingId}`
      : user.id
    : null;

  const update = <K extends keyof CreateHittingurForm>(key: K, value: CreateHittingurForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  useEffect(() => {
    let active = true;
    if (editingId) {
      setRestored(false);
      setLoadFailed(false);
      setErrors([]);
      void Promise.all([
        meetupApi.getMeetup(editingId),
        communityApi.getState(editingId),
        localDraftOwnerId
          ? getHittingarLocalDraft(localDraftOwnerId).catch(() => null)
          : Promise.resolve(null),
      ])
        .then(([detail, community, raw]) => {
          if (!active) return;
          setPublished(detail.status !== 'draft');
          const start = utcToReykjavikFields(detail.startsAt);
          setLegacyFee(detail.admissionMode === 'paid' && detail.currency && detail.currency !== 'ISK' ? meetupFeeLabel(detail, locale) : null);
          const end = utcToReykjavikFields(detail.endsAt);
          const exact =
            detail.location.state === 'public' || detail.location.state === 'protected_revealed'
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
            arrivalInstructions:
              detail.location.state === 'public' || detail.location.state === 'protected_revealed'
                ? (detail.location.arrivalInstructions ?? '')
                : '',
            accessMode: detail.accessMode,
            locationVisibility: detail.locationVisibility,
            capacity: detail.capacity ? String(detail.capacity) : '',
            feeIsk: detail.admissionMode === 'paid' && detail.currency !== 'ISK' ? '' : String(detail.feeIsk ?? detail.priceMinor ?? 0),
            preserveLegacyFee: detail.admissionMode === 'paid' && detail.currency !== 'ISK',
            isExplicit: detail.isExplicit,
            releasePolicy: detail.releasePolicy,
            publicLocationConfirmed: detail.locationVisibility === 'public',
            prohibitedServicesAttested: false,
            rsvpVisibility: 'private',
            onlineUrl: detail.onlineAccess.state === 'revealed' ? detail.onlineAccess.url : '',
            onlineAccessCode:
              detail.onlineAccess.state === 'revealed'
                ? (detail.onlineAccess.accessCode ?? '')
                : '',
            recurring: detail.recurrence !== null,
            recurrenceFrequency: detail.recurrence?.frequency ?? 'weekly',
            recurrenceInterval: String(detail.recurrence?.interval ?? 1),
            recurrenceWeekdays: detail.recurrence?.weekdays ?? [],
            recurrenceEndType: detail.recurrence?.end.kind ?? 'count',
            recurrenceCount:
              detail.recurrence?.end.kind === 'count' ? String(detail.recurrence.end.count) : '4',
            recurrenceEndDate:
              detail.recurrence?.end.kind === 'date' ? detail.recurrence.end.date : '',
          });
          if (raw) {
            try {
              const stored = JSON.parse(raw) as StoredDraft;
              if (stored.draftId === editingId && stored.form) {
                setForm((current) => ({ ...current, ...stored.form }));
                if (Array.isArray(stored.pendingMedia)) {
                  setPendingMedia(
                    stored.pendingMedia
                      .filter(
                        (item) =>
                          item.kind === 'photo' &&
                          typeof item.uri === 'string' &&
                          typeof item.mimeType === 'string',
                      )
                      .slice(0, 3),
                  );
                }
              }
            } catch {
              /* Ignore an unreadable local cache and use the authenticated draft. */
            }
          }
          setRestored(true);
        })
        .catch(() => {
          if (active) {
            setLoadFailed(true);
            setErrors(['event.error']);
          }
        });
      return () => {
        active = false;
      };
    }
    if (!localDraftOwnerId) {
      setRestored(true);
      return () => {
        active = false;
      };
    }
    void getHittingarLocalDraft(localDraftOwnerId)
      .then((raw) => {
        if (!active || !raw) return;
        const stored = JSON.parse(raw) as StoredDraft;
        if (stored.form) setForm({ ...initialCreateHittingurForm, ...stored.form });
        if (stored.draftId) setDraftId(stored.draftId);
        if (Array.isArray(stored.pendingMedia)) {
          setPendingMedia(
            stored.pendingMedia
              .filter(
                (item) =>
                  item.kind === 'photo' &&
                  typeof item.uri === 'string' &&
                  typeof item.mimeType === 'string',
              )
              .slice(0, 3),
          );
        }
      })
      .catch(() => {
        if (active) setSaveStatus('error');
      })
      .finally(() => {
        if (active) setRestored(true);
      });
    return () => {
      active = false;
    };
  }, [editingId, localDraftOwnerId, loadRevision]);

  const persist = useCallback(
    async (nextForm: CreateHittingurForm, syncServer: boolean) => {
      setSaveStatus('saving');
      try {
        if (localDraftOwnerId) {
          await setHittingarLocalDraft(
            localDraftOwnerId,
            JSON.stringify({
              form: nextForm,
              draftId: draftIdRef.current,
              savedAt: new Date().toISOString(),
              pendingMedia: pendingMediaRef.current,
            } satisfies StoredDraft),
          );
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
              await setHittingarLocalDraft(
                localDraftOwnerId,
                JSON.stringify({
                  form: nextForm,
                  draftId: newId,
                  savedAt: new Date().toISOString(),
                  pendingMedia: pendingMediaRef.current,
                } satisfies StoredDraft),
              );
            }
          }
        }
        setSaveStatus('saved');
        return true;
      } catch {
        setSaveStatus('error');
        return false;
      }
    },
    [localDraftOwnerId],
  );

  useEffect(() => {
    if (!restored || saving) return;
    const timer = setTimeout(() => void persist(form, false), 650);
    return () => clearTimeout(timer);
  }, [form, pendingMedia, persist, restored, saving]);

  const searchPlaces = async () => {
    if (search.trim().length < 2) return;
    setSearching(true);
    setSearchFeedback(null);
    try {
      const results = await meetupApi.searchMeetupPlaces(search.trim(), { locale, limit: 6 });
      setPlaces(results);
      if (results.length === 0) setSearchFeedback('empty');
    } catch {
      setPlaces([]);
      setSearchFeedback('error');
    } finally {
      setSearching(false);
    }
  };

  const selectPlace = (place: MeetupPlaceResult) => {
    locationLookupRef.current += 1;
    setForm((current) => formFromPlace(current, place));
    setSearch(place.name);
    setPlaces([]);
    setSearchFeedback(null);
  };

  const selectPin = async (coordinate: GeoCoordinate) => {
    const request = ++locationLookupRef.current;
    setForm((current) => ({
      ...current,
      ...coordinate,
      venueName: '',
      address: '',
      generalAreaId: null,
      publicLocationConfirmed: false,
    }));
    try {
      const place = await meetupApi.reverseGeocodeMeetupPlace(coordinate, { locale, limit: 1 });
      if (place && request === locationLookupRef.current) {
        setForm((current) => formFromPlace(current, place));
        setSearch(place.name);
      }
    } catch {
      // The chosen coordinate remains usable when reverse geocoding is unavailable.
    }
  };

  const save = async (publish: boolean) => {
    if (saving || !restored) return;
    const allErrors = validateCreateHittingur(form, { publishing: publish && !published });
    setErrors(allErrors);
    if (allErrors.length > 0) return;
    setSaving(true);
    try {
      if (!(await persist(form, true))) throw new Error('event_save_failed');
      const id = draftIdRef.current;
      if (!id) throw new Error('Draft id missing');
      await communityApi.setQuestions(
        id,
        form.applicationQuestions.map((value) => value.trim()).filter(Boolean),
      );
      for (const item of pendingMedia) {
        const mediaId = await meetupApi.uploadMeetupMedia(id, item.uri, item.kind, item.mimeType);
        setPendingMedia((current) => current.filter((value) => value !== item));
        if (item.isCover && typeof mediaId === 'string') await communityApi.setCover(id, mediaId);
      }
      if (publish) {
        if (!published) await meetupApi.publishMeetup(id);
        if (localDraftOwnerId) await clearHittingarLocalDraft(localDraftOwnerId);
        router.replace(`/hittingar/${id}` as Href);
      } else {
        if (localDraftOwnerId) await clearHittingarLocalDraft(localDraftOwnerId);
        router.replace('/hittingar/mine' as Href);
      }
    } catch {
      setMediaRevision((value) => value + 1);
      setErrors(['event.error']);
    } finally {
      setSaving(false);
    }
  };

  const close = async () => {
    if (saving) return;
    if (restored) await persist(form, false);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/hittingar' as Href);
  };
  const copy = (is: string, en: string) => locale === 'is' ? is : en;
  const coordinate = form.latitude === null || form.longitude === null ? null : { latitude: form.latitude, longitude: form.longitude };
  const stageLabels = [copy('Upplýsingar', 'Information'), copy('Staður', 'Place'), copy('Stillingar', 'Settings')];
  const continueStage = () => {
    const nextErrors = step === 0 ? [...validateCreateStep(0, form).filter(key => key !== 'hittingar.create.error.eventProfile'), ...validateCreateStep(1, form).filter(key => key === 'hittingar.create.error.start')] : validateCreateStep(2, form);
    setErrors([...new Set(nextErrors)]);
    if (!nextErrors.length) { setStep(step + 1); setAdvanced(false); }
  };
  return (
    <HittingurCreationWindow title={t(editingId ? 'hittingar.create.editTitle' : 'hittingar.create.title')} onClose={() => void close()} busy={saving} footer={<>
      {errors.length > 0 && <View accessibilityRole="alert" style={styles.errors}>{errors.map(key => <Text key={key} style={[styles.errorText, { color: theme.colors.danger }]}>{t(key)}</Text>)}</View>}
      <View style={styles.actions}>
        {step > 0 && <View style={styles.flex}><Button variant="secondary" disabled={saving} label={copy('Til baka', 'Back')} onPress={() => { setStep(step - 1); setAdvanced(false); setErrors([]); }} /></View>}
        <View style={styles.flex}><Button disabled={!restored} loading={saving} label={step === 2 ? t(editingId ? 'hittingar.create.saveChanges' : 'hittingar.create.publish') : copy('Áfram', 'Continue')} onPress={() => step === 2 ? void save(true) : continueStage()} /></View>
      </View>
      {step === 2 && !published && <Button label={t('hittingar.create.saveDraft')} variant="ghost" disabled={!restored || saving} onPress={() => void save(false)} />}
    </>}>
      {!restored ? loadFailed ? <Button label={t('common.retry')} variant="secondary" onPress={() => setLoadRevision(value => value + 1)} /> : <ActivityIndicator color={theme.colors.accent} /> : <View pointerEvents={saving ? 'none' : 'auto'} style={styles.page}>
        <View style={styles.stages}>{stageLabels.map((label, index) => <View key={label} style={[styles.stage, { borderBottomColor: index === step ? theme.colors.accent : theme.colors.border }]}><Text accessibilityRole={index === step ? 'header' : undefined} style={[styles.stageLabel, { color: index === step ? theme.colors.accent : theme.colors.textMuted }]}>{index + 1} {label}</Text></View>)}</View>
        <Text accessibilityRole="header" style={[textStyles.heading, { color: theme.colors.text }]}>{stageLabels[step]}</Text>
        {step === 0 && <>
          <Field label={t('hittingar.create.nameLabel')} value={form.title} maxLength={100} onChangeText={value => update('title', value)} placeholder={t('hittingar.create.titlePlaceholder')} />
          <Field label={t('hittingar.create.aboutLabel')} value={form.description} maxLength={4000} onChangeText={value => update('description', value)} multiline placeholder={t('hittingar.create.aboutPlaceholder')} />
          <HittingurStartFields date={form.startDate} time={form.startTime} onDateChange={value => update('startDate', value)} onTimeChange={value => update('startTime', value)} disabled={saving} />
          <Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.timezoneTitle')}</Text>
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.picturesSection')}</Text>
          <EventMediaGallery key={(draftId ?? 'new') + '.' + mediaRevision} creationPhotos id={draftId} editable disabled={saving} pending={pendingMedia} onPendingChange={setPendingMedia} />
        </>}
        {step === 1 && <>
          <View style={styles.wrap}>{HITTINGUR_VENUE_MODES.map(value => <ChoiceChip key={value} label={t('hittingar.venue.' + value as TranslationKey)} selected={form.venueMode === value} onPress={() => update('venueMode', value)} />)}</View>
          {form.venueMode !== 'in_person' && <><Field label={t('hittingar.create.onlineUrl')} value={form.onlineUrl} onChangeText={value => update('onlineUrl', value)} placeholder="https://" /><Field label={t('hittingar.create.onlineCode')} value={form.onlineAccessCode} onChangeText={value => update('onlineAccessCode', value)} /></>}
          {form.venueMode !== 'online' && <>
            <View style={styles.searchRow}><View style={styles.flex}><Field label={t('hittingar.create.searchLabel')} value={search} onChangeText={value => { setSearch(value); setPlaces([]); setSearchFeedback(null); }} onSubmitEditing={() => void searchPlaces()} placeholder={t('hittingar.create.searchPlaceholder')} /></View><Button variant="secondary" label={copy('Leita', 'Search')} loading={searching} onPress={() => void searchPlaces()} /></View>
            {searchFeedback && <Text accessibilityLiveRegion="polite" style={{ color: searchFeedback === 'error' ? theme.colors.danger : theme.colors.textMuted }}>{searchFeedback === 'error' ? copy('Staðaleitin tókst ekki. Reyndu aftur.', 'Place search failed. Please try again.') : copy('Engir staðir fundust.', 'No places found.')}</Text>}
            {places.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => selectPlace(place)} style={[styles.place, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Ionicons name="location-outline" size={21} color={theme.colors.accent} /><View style={styles.switchCopy}><Text style={[styles.placeTitle, { color: theme.colors.text }]}>{place.name}</Text><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{place.fullAddress ?? place.generalArea}</Text></View></Pressable>)}
            {coordinate && <View style={[styles.place, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Ionicons name="checkmark-circle" size={22} color={theme.colors.accent} /><View style={styles.switchCopy}><Text style={[styles.placeTitle, { color: theme.colors.text }]}>{form.venueName || t('hittingar.create.mapPin')}</Text><Text style={{ color: theme.colors.textMuted }}>{form.address}{form.generalAreaId ? ' · ' + t(generalAreaKey(form.generalAreaId)) : ''}</Text></View><Button variant="ghost" label={copy('Svæði', 'Area')} onPress={() => setShowAreas(value => !value)} /></View>}
            <Button label={t(showMap ? 'hittingar.create.hideMap' : 'hittingar.create.chooseOnMap')} icon="map-outline" variant="ghost" onPress={() => setShowMap(value => !value)} />
            {showMap && <HittingurLocationPicker value={coordinate} onChange={value => void selectPin(value)} />}
            {(showAreas || (coordinate && !form.generalAreaId)) && <View style={styles.areaGrid}>{HITTINGUR_GENERAL_AREAS.map(value => <ChoiceChip key={value} label={t(generalAreaKey(value))} selected={form.generalAreaId === value} onPress={() => { update('generalAreaId', value); setShowAreas(false); }} />)}</View>}
            <View style={styles.wrap}><ChoiceChip label={t('hittingar.location.protected')} selected={form.locationVisibility === 'protected'} onPress={() => setForm(current => ({ ...current, locationVisibility: 'protected', publicLocationConfirmed: false }))} /><ChoiceChip label={t('hittingar.location.public')} selected={form.locationVisibility === 'public'} onPress={() => setForm(current => ({ ...current, locationVisibility: 'public', publicLocationConfirmed: false }))} /></View>
            {form.locationVisibility === 'protected' ? <Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.locationDefault')}</Text> : <View style={[styles.confirm, { borderColor: theme.colors.danger }]}><View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.colors.text }]}>{t('hittingar.location.publicConfirmTitle')}</Text><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.location.publicConfirmBody')}</Text></View><Switch accessibilityLabel={t('hittingar.location.publicConfirmTitle')} value={form.publicLocationConfirmed} onValueChange={value => update('publicLocationConfirmed', value)} trackColor={{ true: theme.colors.accent }} /></View>}
          </>}
        </>}
        {step === 2 && <>
          <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.accessLabel')}</Text>
          <EventProfileFields value={form.eventProfile} section="admission" onChange={value => setForm(current => ({ ...current, eventProfile: value, accessMode: value.joinMode === 'request' ? 'private' : 'open' }))} />
          {form.eventProfile.joinMode === 'request' && form.applicationQuestions.length > 0 && <ApplicationQuestions value={form.applicationQuestions} onChange={value => update('applicationQuestions', value)} />}
          <Field label={t('hittingar.create.capacityLabel')} value={form.capacity} onChangeText={value => update('capacity', value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={t('hittingar.create.capacityPlaceholder')} />
          {legacyFee ? <Text style={{ color: theme.colors.textMuted }}>{copy('Núverandi þátttökugjald', 'Existing participation fee')}: {legacyFee}</Text> : <><Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{copy('Þátttökugjald', 'Participation fee')}</Text><View style={styles.wrap}><ChoiceChip label={copy('Ókeypis', 'Free')} selected={!Number(form.feeIsk)} onPress={() => update('feeIsk', '0')} /><ChoiceChip label={copy('Gjald', 'Paid')} selected={Number(form.feeIsk) > 0} onPress={() => update('feeIsk', Number(form.feeIsk) > 0 ? form.feeIsk : '1000')} /></View>{form.feeIsk !== '0' && <Field label={copy('Heilar krónur (ISK)', 'Whole ISK amount')} value={form.feeIsk} onChangeText={value => update('feeIsk', value)} keyboardType="number-pad" />}</>}
          {(legacyFee || Number(form.feeIsk) > 0) && <Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{copy('Greitt beint til gestgjafa.', 'Paid directly to the host.')}</Text>}
          <Button variant="ghost" icon="options-outline" label={t('hittingar.create.moreSettings')} onPress={() => setAdvanced(value => !value)} />
          {advanced && <View style={styles.form}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.categoryLabel')}</Text><View style={styles.wrap}>{HITTINGUR_CATEGORIES.map(value => <ChoiceChip key={value} label={t('hittingar.category.' + value as TranslationKey)} selected={form.category === value} onPress={() => update('category', value)} />)}</View>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('hittingar.create.intentionLabel')}</Text><View style={styles.wrap}>{HITTINGUR_INTENTIONS.map(value => <ChoiceChip key={value} label={t('hittingar.intention.' + value as TranslationKey)} selected={form.intention === value} onPress={() => update('intention', value)} />)}</View>
            <Field label={t('event.rules')} value={form.eventProfile.rules} onChangeText={rules => update('eventProfile', { ...form.eventProfile, rules })} maxLength={4000} multiline />
            {form.eventProfile.joinMode === 'request' && <ApplicationQuestions value={form.applicationQuestions} onChange={value => update('applicationQuestions', value)} />}
            <Field label={t('hittingar.create.instructionsLabel')} value={form.arrivalInstructions} onChangeText={value => update('arrivalInstructions', value)} multiline />
            {form.locationVisibility === 'protected' && <View style={styles.wrap}><ChoiceChip label={t('hittingar.create.release24')} selected={form.releasePolicy === '24_hours_before'} onPress={() => update('releasePolicy', '24_hours_before')} /><ChoiceChip label={t('hittingar.create.releaseImmediate')} selected={form.releasePolicy === 'immediate'} onPress={() => update('releasePolicy', 'immediate')} /></View>}
            <View style={[styles.confirm, { borderColor: theme.colors.border }]}><View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.colors.text }]}>{t('hittingar.create.recurringTitle')}</Text><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.recurringBody')}</Text></View><Switch accessibilityLabel={t('hittingar.create.recurringTitle')} disabled={published} value={form.recurring} onValueChange={recurring => setForm(current => ({ ...current, recurring, recurrenceWeekdays: current.recurrenceWeekdays.length ? current.recurrenceWeekdays : [new Date(current.startDate + 'T00:00:00Z').getUTCDay()] }))} trackColor={{ true: theme.colors.accent }} /></View>
            {form.recurring && <View pointerEvents={published ? 'none' : 'auto'} style={styles.form}>
              <View style={styles.wrap}>{(['daily', 'weekly', 'monthly'] as const).map(value => <ChoiceChip key={value} label={t('hittingar.recurrence.' + value as TranslationKey)} selected={form.recurrenceFrequency === value} onPress={() => update('recurrenceFrequency', value)} />)}</View>
              <Field label={t('hittingar.create.recurrenceInterval')} value={form.recurrenceInterval} keyboardType="number-pad" onChangeText={value => update('recurrenceInterval', value)} />
              {form.recurrenceFrequency === 'weekly' && <View style={styles.wrap}>{(locale === 'is' ? ['Sun', 'Mán', 'Þri', 'Mið', 'Fim', 'Fös', 'Lau'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map((label, day) => <ChoiceChip key={day} label={label} selected={form.recurrenceWeekdays.includes(day)} onPress={() => update('recurrenceWeekdays', form.recurrenceWeekdays.includes(day) ? form.recurrenceWeekdays.filter(value => value !== day) : [...form.recurrenceWeekdays, day])} />)}</View>}
              <View style={styles.wrap}><ChoiceChip label={t('hittingar.create.endByCount')} selected={form.recurrenceEndType === 'count'} onPress={() => update('recurrenceEndType', 'count')} /><ChoiceChip label={t('hittingar.create.endByDate')} selected={form.recurrenceEndType === 'date'} onPress={() => update('recurrenceEndType', 'date')} /></View>
              {form.recurrenceEndType === 'count' ? <Field label={t('hittingar.create.occurrenceCount')} value={form.recurrenceCount} keyboardType="number-pad" onChangeText={value => update('recurrenceCount', value)} /> : <Field label={t('hittingar.create.recurrenceEndDate')} value={form.recurrenceEndDate} onChangeText={value => update('recurrenceEndDate', value)} placeholder="YYYY-MM-DD" />}
            </View>}
            <Field label={t('hittingar.create.endDateLabel')} value={form.endDate} onChangeText={value => update('endDate', value)} placeholder="YYYY-MM-DD" /><Field label={t('hittingar.create.endTimeLabel')} value={form.endTime} onChangeText={value => update('endTime', value)} placeholder="HH:mm" />
          </View>}
          <View style={[styles.confirm, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}><View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.colors.text }]}>{t('hittingar.create.attestationTitle')}</Text><Text style={[styles.switchBody, { color: theme.colors.textMuted }]}>{t('hittingar.create.attestationBody')}</Text></View><Switch accessibilityLabel={t('hittingar.create.attestationTitle')} value={form.prohibitedServicesAttested} onValueChange={value => update('prohibitedServicesAttested', value)} trackColor={{ true: theme.colors.accent }} /></View>
        </>}
        {saveStatus !== 'idle' && <Text accessibilityLiveRegion="polite" style={[styles.saveStatus, { color: saveStatus === 'error' ? theme.colors.danger : theme.colors.textMuted }]}>{t('hittingar.create.saveStatus.' + saveStatus as TranslationKey)}</Text>}
      </View>}
    </HittingurCreationWindow>
  );
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  stages: { flexDirection: 'row', gap: 8 },
  stage: { flex: 1, borderBottomWidth: 2, paddingBottom: 10 },
  stageLabel: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  section: { gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionNumber: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advancedButton: {
    minHeight: 48,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  changeArea: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  saveStatus: { fontSize: 11, fontWeight: '700', textAlign: 'right' },
  form: { gap: 15 },
  fieldLabel: { fontSize: 14, fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  areaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  areaCell: { width: '48%', flexGrow: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  searchButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoColumns: { flexDirection: 'row', gap: 10 },
  switchRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchCopy: { flex: 1, gap: 3 },
  switchTitle: { fontSize: 15, fontWeight: '800' },
  switchBody: { fontSize: 13, lineHeight: 19 },
  place: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  placeTitle: { fontSize: 14, fontWeight: '800' },
  confirm: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errors: { gap: 4 },
  errorText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 9 },
  flex: { flex: 1 },
});
