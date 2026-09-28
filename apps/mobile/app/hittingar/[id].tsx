import type { CommunityState } from '@rummal/shared';
import { communityApi } from '@/services/community';
import { EventCover } from '@/features/hittingar/EventCover';
import { EventFollowing, EventAdmission, EventAnnouncements, CommunityError } from '@/features/hittingar/CommunityPanels';
import { PoolSummary } from '@/features/hittingar/PoolSummary';
import { useEntitlement } from '@/hooks/useEntitlement';
import { EventGender } from '@/features/hittingar/EventGender';
import { EventMediaGallery } from '@/features/hittingar/EventMedia';
import { EventReviews } from '@/features/hittingar/EventReviews';
import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { formatHittingurDate, HittingurPrimaryButton, SafetyNotice, StatusPill } from '@/features/hittingar/components';
import { categoryKey, generalAreaLabel, tagKey } from '@/features/hittingar/model';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import type { MeetupDetail } from '@/types/domain';
import { confirmAction } from '@/utils/confirmAction';

type DetailParams = { id?: string };
const meetupApi = api as RummalApi;

export default function HittingurDetailScreen() {
  const { id } = useLocalSearchParams<DetailParams>();
  const { user } = useApp();
  return <HittingurDetailSession key={`${id}:${user?.id}`} id={user ? id : undefined} />;
}

function HittingurDetailSession({ id }: DetailParams) {
  const router = useRouter();
  const { locale, t, theme } = useApp();
  const { entitlement } = useEntitlement();
  const [detail, setDetail] = useState<MeetupDetail | null>(null);
  const [community, setCommunity] = useState<CommunityState | null>(null);
  const [communityError, setCommunityError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const active = useRef(false);
  const revision = useRef(0);
  const acting = useRef(false);

  const load = useCallback(async () => {
    if (!id || !active.current) return;
    const ticket = ++revision.current;
    setLoading(true);
    setError(false);
    try {
      const nextDetail = await meetupApi.getMeetup(id);
      const nextCommunity = await communityApi.getState(id).catch(() => null);
      if (!active.current || ticket !== revision.current) return;
      setDetail(nextDetail); setCommunity(nextCommunity); setCommunityError(nextCommunity === null);
    } catch {
      if (active.current && ticket === revision.current) { setDetail(null); setCommunity(null); setError(true); }
    } finally {
      if (active.current && ticket === revision.current) setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    const clear = () => { active.current = false; ++revision.current; setDetail(null); setCommunity(null); setLoading(Boolean(id)); };
    const resume = () => { active.current = true; void load(); };
    if (AppState.currentState === 'active') resume();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') resume(); else clear(); });
    return () => { subscription.remove(); clear(); };
  }, [id, load]));
  useEffect(() => {
    if (!detail) return;
    const deadlines = [detail.viewerState.confirmationDeadlineAt,
      detail.location.state === 'protected_revealed' ? detail.location.accessExpiresAt : undefined,
      detail.onlineAccess.state === 'revealed' ? detail.onlineAccess.accessExpiresAt : undefined]
      .filter((value): value is string => Boolean(value)).map(value => new Date(value).getTime()).filter(value => value > Date.now());
    if (!deadlines.length) return;
    const timer = setTimeout(() => { setDetail(null); setCommunity(null); void load(); }, Math.min(2_147_483_647, Math.max(1, Math.min(...deadlines) - Date.now())));
    return () => clearTimeout(timer);
  }, [detail, load]);

  const runAction = async (operation: () => Promise<unknown>) => {
    if (acting.current || !active.current) return;
    acting.current = true; setActionBusy(true); setActionError(null);
    try { await operation(); await load(); }
    catch (failure) { if (active.current) { setActionError(failure instanceof Error ? failure.message : 'failed'); await load(); } }
    finally { acting.current = false; if (active.current) setActionBusy(false); }
  };

  if (loading && !detail) return <Screen back title={t('hittingar.detail.title')}><View style={styles.center}><Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text></View></Screen>;
  if (error || !detail) return <Screen back title={t('hittingar.detail.title')}><View style={styles.center}><Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.errorTitle')}</Text><Button label={t('common.retry')} onPress={() => void load()} /></View></Screen>;

  const area = generalAreaLabel(detail, locale);
  const exactLocation = detail.capabilities.canViewExactLocation
    && (detail.location.state === 'public' || detail.location.state === 'protected_revealed')
    ? detail.location.exactLocation
    : null;
  const arrivalInstructions = detail.capabilities.canViewArrivalInstructions
    && (detail.location.state === 'public' || detail.location.state === 'protected_revealed')
    ? detail.location.arrivalInstructions
    : undefined;

  const act = async (kind: 'join' | 'request' | 'cancel_request' | 'leave' | 'manage' | 'disabled') => {
    if (kind === 'disabled') return;
    if (kind === 'manage') return router.push(`/hittingar/${detail.id}/manage` as Href);
    const run = () => runAction(async () => {
        if (kind === 'join') await meetupApi.joinMeetup(detail.id);
        if (kind === 'request') return; // Applications are submitted with introduction and accepted rules below.
        if (kind === 'cancel_request') await meetupApi.cancelMeetupRequest(detail.id);
        if (kind === 'leave') await meetupApi.leaveMeetup(detail.id);
    });
    if (kind === 'leave' || kind === 'cancel_request') {
      const leave = kind === 'leave';
      return confirmAction({
        title: t(leave ? 'hittingar.leave.confirmTitle' : 'hittingar.request.cancelTitle'),
        message: t(leave ? 'hittingar.leave.confirmBody' : 'hittingar.request.cancelBody'),
        cancelLabel: t('common.cancel'),
        confirmLabel: t(leave ? 'hittingar.action.leave' : 'hittingar.action.cancelRequest'),
        destructive: true,
        onConfirm: run,
      });
    }
    await run();
  };

  const blockHost = () => confirmAction({
    title: t('hittingar.block.confirmTitle', { name: detail.host.displayName }),
    message: t('hittingar.block.confirmBody'),
    cancelLabel: t('common.cancel'),
    confirmLabel: t('hittingar.block.action'),
    destructive: true,
    onConfirm: () => runAction(() => meetupApi.block(detail.host.id).then(() => router.replace('/(tabs)/hittingar' as Href))),
  });


  const openOnlineAccess = () => {
    if (detail.onlineAccess.state !== 'revealed') return;
    const hostname = new URL(detail.onlineAccess.url).hostname;
    Alert.alert(t('hittingar.room.externalTitle'), t('hittingar.room.externalBody', { hostname }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('hittingar.room.openLink'), onPress: () => void runAction(async () => {
        const next = await meetupApi.getMeetup(detail.id);
        if (!active.current) return;
        setDetail(next);
        if (next.onlineAccess.state !== 'revealed' || new Date(next.onlineAccess.accessExpiresAt).getTime() <= Date.now()) throw new Error('meeting_access_unavailable');
        // A changed destination needs a new confirmation showing its hostname.
        if (new URL(next.onlineAccess.url).hostname !== hostname) throw new Error('meeting_destination_changed');
        await Linking.openURL(next.onlineAccess.url);
      }) },
    ]);
  };

  return (
    <Screen back title={t('hittingar.detail.title')}>
      <View style={styles.page}>
        {actionError && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{/join.*(limit|quota)|(limit|quota).*join/i.test(actionError) ? (locale === 'is' ? 'Þú hefur náð þátttökumörkum fyrir mánuð þessa hittings.' : 'You have reached your joining allowance for this event’s month.') : t('hittingar.actionFailed')}</Text>{/join.*(limit|quota)|(limit|quota).*join/i.test(actionError) && <Button label={locale === 'is' ? 'Skoða áskriftir' : 'View membership options'} onPress={() => router.push('/membership' as Href)} />}</View>}
        {detail.isExplicit && (
          <View style={[styles.adultBanner, { backgroundColor: theme.colors.surfaceMuted }]}>
            <Text style={[styles.adultMark, { color: theme.colors.danger }]}>18+</Text>
            <Text style={[styles.adultCopy, { color: theme.colors.text }]}>{t('hittingar.adultNotice')}</Text>
          </View>
        )}
        {detail.status !== 'published' && <StatusPill label={t(`hittingar.status.${detail.status}`)} tone={detail.status === 'cancelled' || detail.status === 'moderation_hidden' ? 'danger' : 'warning'} />}
        <EventCover cover={community?.cover ?? detail.cover} title={detail.title} playable />
        <EventMediaGallery id={detail.id} />
        {detail.diagnosisRestricted&&<View style={{gap:10}}><Text style={{color:theme.colors.text,fontWeight:'700'}}>{t('diagnosis.required')}</Text><Text style={{color:theme.colors.textMuted}}>{t('diagnosis.requiredHelp')}</Text>{detail.requiresDiagnosisVerification&&<Button variant="secondary" label={t('diagnosis.title')} onPress={()=>router.push('/diagnoses' as Href)}/>}</View>}
        <Text style={[textStyles.title, { color: theme.colors.text }]}>{detail.title}</Text>
        <PoolSummary pool={detail.pool} />
        {detail.pool?.status === 'accepting' && detail.status === 'published' && <Button label={entitlement?.tier && entitlement.tier !== 'plebbi' ? (locale === 'is' ? 'Styrkja hitting' : 'Sponsor this meetup') : (locale === 'is' ? 'Gerast áskrifandi og styrkja' : 'Upgrade to sponsor')} onPress={() => router.push((entitlement?.tier && entitlement.tier !== 'plebbi' ? `/wallet?meetupId=${encodeURIComponent(detail.id)}` : '/membership') as Href)} />}
        <View style={styles.pills}>
          <StatusPill label={t(categoryKey(detail.category))} />
          {detail.eventProfile?.customTags.map(tag => <StatusPill key={tag} label={tag} />)}
          {detail.tags.map((tag) => <StatusPill key={tag} label={t(tagKey(tag))} />)}
          <StatusPill icon={detail.accessMode === 'open' ? 'lock-open-outline' : 'lock-closed-outline'} label={detail.eventProfile ? t(`event.${detail.eventProfile.joinMode}`) : t(`hittingar.access.${detail.accessMode}`)} tone="accent" />
          {detail.locationVisibility === 'protected' && <StatusPill icon="shield-checkmark-outline" label={t('hittingar.location.protected')} tone="warning" />}
        </View>
        <View style={[styles.heroCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <InfoRow icon="calendar-outline" title={formatHittingurDate(detail.startsAt, locale)} body={detail.endsAt ? t('hittingar.detail.ends', { value: formatHittingurDate(detail.endsAt, locale) }) : t('hittingar.detail.defaultEnd')} />
          {detail.venueMode !== 'online' && <InfoRow icon="location-outline" title={area} body={detail.location.marker.isApproximate ? t('hittingar.location.approximateBody') : t('hittingar.location.publicBody')} />}
          <InfoRow icon="people-outline" title={detail.capacity ? t('hittingar.capacityCount', { count: detail.participantCount, capacity: detail.capacity }) : t('hittingar.participantCount', { count: detail.participantCount })} body={detail.isFull ? t('hittingar.action.full') : detail.eventProfile?.joinMode === 'invite' ? t('event.invite') : t(`hittingar.access.${detail.accessMode}Body`)} />
        </View>
        <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.detail.about')}</Text>
        <Text style={[textStyles.body, { color: theme.colors.text }]}>{detail.description}</Text>
        {detail.eventProfile && <>
          {[{ title: t('event.rules'), body: detail.eventProfile.rules }, { title: t('event.prerequisites'), body: detail.eventProfile.prerequisites }, ...detail.eventProfile.sections].filter(item => item.body).map((item, index) => <View key={index} style={[styles.heroCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{item.title}</Text>
            <Text style={[textStyles.body, { color: theme.colors.text }]}>{item.body}</Text>
          </View>)}
          <View style={[styles.heroCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('event.ages')}: {detail.eventProfile.minAge}–{detail.eventProfile.maxAge ?? '120'}</Text>
            {detail.eventProfile.ageLimits.map((rule, index) => <Text key={index} style={{ color: theme.colors.text }}>{rule.minAge}–{rule.maxAge}: {t('event.maxRsvp')} {rule.maxRsvp}</Text>)}
            {detail.eventProfile.genderLimits.map(rule => <Text key={rule.gender} style={{ color: theme.colors.text }}>{t(`event.gender.${rule.gender}`)}: {t('event.maxRsvp')} {rule.maxRsvp}</Text>)}
          </View>
        </>}
        {Boolean(detail.eventProfile?.genderLimits.length) && detail.viewerState.participationStatus !== 'host' && <EventGender id={detail.id} onSaved={() => { void load(); }} />}
        {community && <EventFollowing detail={detail} value={community} reload={load} />}
        {communityError && <><CommunityError /><Button variant="secondary" label={t('common.retry')} onPress={() => void load()} /></>}
        <EventAnnouncements id={detail.id} />
        <EventReviews detail={detail} />
        <View style={[styles.hostCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.hostIcon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="person" size={24} color={theme.colors.accent} /></View>
          <View style={styles.hostCopy}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>{t('hittingar.detail.host')}</Text>
            <Text style={[styles.hostName, { color: theme.colors.text }]}>{detail.host.displayName}</Text>
          </View>
          <Button label={locale === 'is' ? 'Hittingar gestgjafa' : 'Host gatherings'} variant="ghost" onPress={() => router.push(`/hittingar/host/${detail.host.id}` as Href)} />
        </View>
        {detail.venueMode !== 'online' && detail.location.state === 'protected_locked' && (
          <SafetyNotice title={t('hittingar.location.lockedTitle')}>
            <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t(detail.viewerState.participationStatus === 'pending' ? 'hittingar.location.pendingBody' : 'hittingar.location.lockedBody')}</Text>
            <Text style={[styles.releaseAt, { color: theme.colors.text }]}>{t('hittingar.location.releasesAt', { value: formatHittingurDate(detail.location.releaseAt, locale) })}</Text>
          </SafetyNotice>
        )}
        {detail.venueMode !== 'online' && exactLocation && (
          <View style={[styles.exactCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.warning }]}>
            <View style={styles.exactHeader}>
              <Ionicons name="shield-checkmark" size={24} color={theme.colors.warning} />
              <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.location.exactTitle')}</Text>
            </View>
            {exactLocation.venueName && <Text style={[styles.exactVenue, { color: theme.colors.text }]}>{exactLocation.venueName}</Text>}
            {exactLocation.address && <Text style={[textStyles.body, { color: theme.colors.text }]}>{exactLocation.address}</Text>}
            {arrivalInstructions && <Text style={[styles.instructions, { color: theme.colors.textMuted }]}>{arrivalInstructions}</Text>}
            <Text style={[styles.sensitiveReminder, { color: theme.colors.danger }]}>{t('hittingar.location.doNotShare')}</Text>
            {detail.location.state === 'protected_revealed' && <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t('hittingar.location.availableUntil', { value: formatHittingurDate(detail.location.accessExpiresAt, locale) })}</Text>}
          </View>
        )}
        {detail.onlineAccess.state === 'locked' && (
          <SafetyNotice title={t('hittingar.online.lockedTitle')}>
            <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t('hittingar.online.lockedBody')}</Text>
          </SafetyNotice>
        )}
        {detail.onlineAccess.state === 'revealed' && (
          <View style={[styles.exactCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.warning }]}>
            <View style={styles.exactHeader}><Ionicons name="videocam" size={24} color={theme.colors.warning} /><Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.online.title')}</Text></View>
            <Text style={[textStyles.body, { color: theme.colors.text }]}>{new URL(detail.onlineAccess.url).hostname}</Text>
            {detail.onlineAccess.accessCode && <Text selectable style={[styles.exactVenue, { color: theme.colors.text }]}>{t('hittingar.online.code', { code: detail.onlineAccess.accessCode })}</Text>}
            <Text style={[styles.sensitiveReminder, { color: theme.colors.danger }]}>{t('hittingar.online.doNotShare')}</Text>
            <Button variant="secondary" icon="open-outline" label={t('hittingar.online.open')} onPress={openOnlineAccess} />
          </View>
        )}
        <SafetyNotice title={t('hittingar.consent.title')} tone="accent">
          <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t('hittingar.consent.body')}</Text>
        </SafetyNotice>
        {community && <EventAdmission detail={detail} value={community} reload={load} />}
        {(detail.eventProfile?.joinMode ?? (detail.accessMode === 'private' ? 'request' : 'public')) !== 'request' || detail.capabilities.canLeave || detail.capabilities.canCancelRequest || detail.capabilities.canEdit ? <HittingurPrimaryButton item={detail} busy={loading || actionBusy} onAction={(kind) => void act(kind)} /> : null}
        {detail.status === 'published' && ['joined', 'approved', 'host'].includes(detail.viewerState.participationStatus) && <Button variant="secondary" icon="qr-code-outline" label={locale === 'is' ? 'Skrá mætingu' : 'Check in'} onPress={() => router.push(`/check-in?meetupId=${detail.id}` as Href)} />}
        <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Aðeins gestgjafi sér hverjir taka þátt. Aðrir sjá aðeins fjölda.' : 'Only the host sees who is attending. Other people see counts only.'}</Text>
        <View style={styles.safetyActions}>
          <Button variant="secondary" icon="star-outline" label={t('social.star')} onPress={() => void meetupApi.toggleStarredItem('event', detail.id, detail.title)} />
          {detail.capabilities.canViewRoom && <Button variant="secondary" icon="chatbubbles-outline" label={t('hittingar.room.open')} onPress={() => router.push(`/hittingar/${detail.id}/room` as Href)} />}
          {detail.capabilities.canConfirmAttendance && detail.viewerState.attendanceState === 'confirmation_pending' && <>
            {detail.viewerState.confirmationDeadlineAt && <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t('hittingar.confirmBefore', { value: formatHittingurDate(detail.viewerState.confirmationDeadlineAt, locale) })}</Text>}
            <Button disabled={actionBusy} loading={actionBusy} icon="checkmark-circle-outline" label={t('hittingar.confirmAttendance')} onPress={() => void runAction(() => meetupApi.confirmMeetupAttendance(detail.id))} />
          </>}
        </View>
        {(detail.capabilities.canReport || detail.capabilities.canBlockHost) && (
          <View style={styles.safetyActions}>
            {detail.capabilities.canReport && <Button label={t('hittingar.report.event')} variant="secondary" icon="flag-outline" onPress={() => router.push(`/hittingar/${detail.id}/report` as Href)} />}
            {detail.capabilities.canReport && <Button label={t('hittingar.report.host')} variant="secondary" icon="shield-outline" onPress={() => router.push(`/report/${detail.host.id}?name=${encodeURIComponent(detail.host.displayName)}` as Href)} />}
            {detail.capabilities.canBlockHost && <Button label={t('hittingar.block.action')} variant="danger" icon="ban-outline" onPress={blockHost} />}
          </View>
        )}
      </View>
    </Screen>
  );
}

function InfoRow({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const { theme } = useApp();
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name={icon} size={20} color={theme.colors.accent} /></View>
      <View style={styles.hostCopy}>
        <Text style={[styles.infoTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 44, gap: 18 },
  center: { minHeight: 420, padding: 28, justifyContent: 'center', alignItems: 'center', gap: 14 },
  adultBanner: { borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  adultMark: { fontSize: 16, fontWeight: '900' },
  adultCopy: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  heroCard: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 15 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 15, fontWeight: '800' },
  hostCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hostIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  hostCopy: { flex: 1, gap: 2 },
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  hostName: { fontSize: 17, fontWeight: '800' },
  noticeBody: { fontSize: 13, lineHeight: 19 },
  releaseAt: { fontSize: 13, lineHeight: 19, fontWeight: '800', marginTop: 4 },
  exactCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 20, padding: 17, gap: 8 },
  exactHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  exactVenue: { fontSize: 18, fontWeight: '900' },
  instructions: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  sensitiveReminder: { fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 4 },
  safetyActions: { gap: 9 },
  visibilityActions: { gap: 8 },
});
