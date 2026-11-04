import type { CommunityState } from '@rummal/shared';
import { communityApi } from '@/services/community';
import { EventCover } from '@/features/hittingar/EventCover';
import { EventAdmission, CommunityError } from '@/features/hittingar/CommunityPanels';
import { EventGender } from '@/features/hittingar/EventGender';
import { EventPlanning } from '@/features/hittingar/EventPlanning';
import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { formatHittingurDate, HittingurPrimaryButton, SafetyNotice, StatusPill } from '@/features/hittingar/components';
import { generalAreaLabel, meetupFeeLabel } from '@/features/hittingar/model';
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
  const [detail, setDetail] = useState<MeetupDetail | null>(null);
  const [community, setCommunity] = useState<CommunityState | null>(null);
  const [communityError, setCommunityError] = useState(false);
  const [moreOptions, setMoreOptions] = useState(false);
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
    confirmAction({
      title: t('hittingar.room.externalTitle'),
      message: t('hittingar.room.externalBody', { hostname }),
      cancelLabel: t('common.cancel'),
      confirmLabel: t('hittingar.room.openLink'),
      onConfirm: () => runAction(async () => {
        const next = await meetupApi.getMeetup(detail.id);
        if (!active.current) return;
        setDetail(next);
        if (next.onlineAccess.state !== 'revealed' || new Date(next.onlineAccess.accessExpiresAt).getTime() <= Date.now()) throw new Error('meeting_access_unavailable');
        // A changed destination needs a new confirmation showing its hostname.
        if (new URL(next.onlineAccess.url).hostname !== hostname) throw new Error('meeting_destination_changed');
        await Linking.openURL(next.onlineAccess.url);
      }),
    });
  };

  return (
    <Screen back title={t('hittingar.detail.title')}>
      <View style={styles.page}>
        {actionError && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('hittingar.actionFailed')}</Text>}
        {detail.status !== 'published' && <StatusPill label={t(`hittingar.status.${detail.status}`)} tone={detail.status === 'cancelled' || detail.status === 'moderation_hidden' ? 'danger' : 'warning'} />}
        <EventCover cover={community?.cover ?? detail.cover} title={detail.title} />
        <Text accessibilityRole="header" style={[textStyles.title, { color: theme.colors.text }]}>{detail.title}</Text>
        <View style={styles.heroCard}>
          <InfoRow icon="calendar-outline" title={formatHittingurDate(detail.startsAt, locale)} body={detail.endsAt ? t('hittingar.detail.ends', { value: formatHittingurDate(detail.endsAt, locale) }) : undefined} />
          <InfoRow icon={detail.venueMode === 'online' ? 'videocam-outline' : 'location-outline'} title={detail.venueMode === 'online' ? t('hittingar.venue.online') : exactLocation?.venueName ?? area} body={detail.venueMode !== 'online' ? exactLocation?.address ?? (detail.location.marker.isApproximate ? t('hittingar.location.approximateBody') : undefined) : undefined} />
          <InfoRow icon="people-outline" title={detail.capacity ? t('hittingar.capacityCount', { count: detail.participantCount, capacity: detail.capacity }) : t('hittingar.participantCount', { count: detail.participantCount })} body={detail.isFull ? t('hittingar.action.full') : detail.eventProfile?.joinMode === 'invite' ? t('event.invite') : t(`hittingar.access.${detail.accessMode}`)} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={detail.host.displayName} onPress={() => router.push(('/profile/' + detail.host.id) as Href)} style={[styles.hostCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {detail.host.avatarUrl ? <Image source={{ uri: detail.host.avatarUrl }} style={styles.hostIcon} /> : <View style={[styles.hostIcon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="person" size={24} color={theme.colors.accent} /></View>}
          <View style={styles.hostCopy}><Text style={[styles.label, { color: theme.colors.textMuted }]}>{t('hittingar.detail.host')}</Text><Text style={[styles.hostName, { color: theme.colors.text }]}>{detail.host.displayName}</Text></View><Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </Pressable>
        <Text accessibilityRole="header" style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.detail.about')}</Text>
        <Text style={[textStyles.body, { color: theme.colors.text }]}>{detail.description}</Text>
        {detail.eventProfile?.rules && <View style={{ gap: 6 }}><Text style={[styles.infoTitle, { color: theme.colors.text }]}>{t('event.rules')}</Text><Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{detail.eventProfile.rules}</Text></View>}
        {!!detail.eventProfile?.prerequisites && <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{detail.eventProfile.prerequisites}</Text>}
        {detail.diagnosisRestricted && <View style={{ gap: 8 }}><Text style={{ color: theme.colors.text }}>{t('diagnosis.required')}</Text>{detail.requiresDiagnosisVerification && <Button variant="secondary" label={t('diagnosis.title')} onPress={() => router.push('/diagnoses' as Href)} />}</View>}
        {detail.eventProfile && (detail.eventProfile.minAge > 18 || detail.eventProfile.maxAge !== null) && <Text style={{ color: theme.colors.textMuted }}>{t('event.ages')}: {detail.eventProfile.minAge}–{detail.eventProfile.maxAge ?? '120'}</Text>}
        {Boolean(detail.eventProfile?.genderLimits.length) && detail.viewerState.participationStatus !== 'host' && <EventGender id={detail.id} onSaved={() => { void load(); }} />}
        {detail.venueMode !== 'online' && detail.location.state === 'protected_locked' && <SafetyNotice title={t('hittingar.location.lockedTitle')}><Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t(detail.viewerState.participationStatus === 'pending' ? 'hittingar.location.pendingBody' : 'hittingar.location.lockedBody')}</Text><Text style={[styles.releaseAt, { color: theme.colors.text }]}>{t('hittingar.location.releasesAt', { value: formatHittingurDate(detail.location.releaseAt, locale) })}</Text></SafetyNotice>}
        {exactLocation && arrivalInstructions && <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{arrivalInstructions}</Text>}
        {detail.location.state === 'protected_revealed' && <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t('hittingar.location.doNotShare')}</Text>}
        {detail.onlineAccess.state === 'locked' && <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t('hittingar.online.lockedBody')}</Text>}
        {detail.onlineAccess.state === 'revealed' && <View style={[styles.exactCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.infoTitle, { color: theme.colors.text }]}>{new URL(detail.onlineAccess.url).hostname}</Text>{detail.onlineAccess.accessCode && <Text selectable style={{ color: theme.colors.text }}>{t('hittingar.online.code', { code: detail.onlineAccess.accessCode })}</Text>}<Button variant="secondary" icon="open-outline" label={t('hittingar.online.open')} onPress={openOnlineAccess} /></View>}
        {community && <EventAdmission detail={detail} value={community} reload={load} />}
        {communityError && <><CommunityError /><Button variant="secondary" label={t('common.retry')} onPress={() => void load()} /></>}
        {(detail.eventProfile?.joinMode ?? (detail.accessMode === 'private' ? 'request' : 'public')) !== 'request' || detail.capabilities.canLeave || detail.capabilities.canCancelRequest || detail.capabilities.canEdit ? <HittingurPrimaryButton item={detail} busy={loading || actionBusy} onAction={kind => void act(kind)} /> : null}
        {detail.capabilities.canViewRoom && <Button variant="secondary" icon="chatbubbles-outline" label={t('hittingar.room.open')} onPress={() => router.push(('/hittingar/' + detail.id + '/room') as Href)} />}
        {detail.capabilities.canConfirmAttendance && detail.viewerState.attendanceState === 'confirmation_pending' && <View style={{ gap: 8 }}>{detail.viewerState.confirmationDeadlineAt && <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{t('hittingar.confirmBefore', { value: formatHittingurDate(detail.viewerState.confirmationDeadlineAt, locale) })}</Text>}<Button disabled={actionBusy} loading={actionBusy} icon="checkmark-circle-outline" label={t('hittingar.confirmAttendance')} onPress={() => void runAction(() => meetupApi.confirmMeetupAttendance(detail.id))} /></View>}
        <Button variant="ghost" icon="ellipsis-horizontal" label={locale === 'is' ? 'Fleiri valkostir' : 'More options'} onPress={() => setMoreOptions(value => !value)} />
        {moreOptions && <View style={styles.safetyActions}>
          <EventPlanning detail={detail} />
          {detail.status === 'published' && ['joined', 'approved', 'host'].includes(detail.viewerState.participationStatus) && <Button variant="secondary" icon="qr-code-outline" label={locale === 'is' ? 'Skrá mætingu' : 'Check in'} onPress={() => router.push(('/check-in?meetupId=' + detail.id) as Href)} />}
          <Button variant="secondary" icon="star-outline" label={t('social.star')} disabled={actionBusy} loading={actionBusy} onPress={() => void runAction(() => meetupApi.toggleStarredItem('event', detail.id, detail.title))} />
          {detail.capabilities.canReport && <Button label={t('hittingar.report.event')} variant="secondary" icon="flag-outline" onPress={() => router.push(('/hittingar/' + detail.id + '/report') as Href)} />}
          {detail.capabilities.canReport && <Button label={t('hittingar.report.host')} variant="secondary" icon="shield-outline" onPress={() => router.push(('/report/' + detail.host.id + '?name=' + encodeURIComponent(detail.host.displayName)) as Href)} />}
          {detail.capabilities.canBlockHost && <Button label={t('hittingar.block.action')} variant="danger" icon="ban-outline" onPress={blockHost} />}
        </View>}
      </View>
    </Screen>
  );
}

function InfoRow({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body?: string }) {
  const { theme } = useApp();
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name={icon} size={20} color={theme.colors.accent} /></View>
      <View style={styles.hostCopy}>
        <Text style={[styles.infoTitle, { color: theme.colors.text }]}>{title}</Text>
        {body && <Text style={[styles.noticeBody, { color: theme.colors.textMuted }]}>{body}</Text>}
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
  heroCard: { gap: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 15, fontWeight: '800' },
  hostCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hostIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
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
