import { ApplicationInbox, EventAnnouncements } from '@/features/hittingar/CommunityPanels';
import { PoolSummary } from '@/features/hittingar/PoolSummary';
import { useEntitlement } from '@/hooks/useEntitlement';
import { EventInvitations } from '@/features/hittingar/EventInvitations';
import { EventMediaGallery } from '@/features/hittingar/EventMedia';
import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Field, Screen, textStyles } from '@/components/ui';
import { formatHittingurDate, SafetyNotice, StatusPill } from '@/features/hittingar/components';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import type { MeetupDetail, MeetupReinstateStatus, MeetupRosterEntry } from '@/types/domain';
import { confirmAction } from '@/utils/confirmAction';

type ManageParams = { id?: string };
const meetupApi = api as RummalApi;

export default function ManageHittingurScreen() {
  const { id } = useLocalSearchParams<ManageParams>();
  const router = useRouter();
  const { locale, t, theme, user } = useApp();
  const { entitlement } = useEntitlement();
  const [detail, setDetail] = useState<MeetupDetail | null>(null);
  const [participants, setParticipants] = useState<MeetupRosterEntry[]>([]);
  const [capacity, setCapacity] = useState('');
  const [busy, setBusy] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const revision = useRef(0);
  const actionRevision = useRef(0);
  const actionBusy = useRef(false);
  const load = useCallback(async () => {
    const request = ++revision.current; setLoading(true); setError(false);
    if (!id) { setLoading(false); setError(true); return; }
    try {
      const value = await meetupApi.getMeetup(id);
      const roster = value.capabilities.canManageRequests ? await meetupApi.listMeetupParticipants(id) : [];
      if (request !== revision.current) return;
      setDetail(value); setCapacity(value.capacity ? String(value.capacity) : ''); setParticipants(roster);
    } catch {
      if (request === revision.current) { setError(true); setDetail(null); setParticipants([]); }
    } finally { if (request === revision.current) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => {
    setDetail(null); setParticipants([]); setBusy(false); actionBusy.current = false; void load();
    return () => { revision.current++; actionRevision.current++; actionBusy.current = false; };
  }, [load, user?.id]));
  const runAction = async (operation: () => Promise<unknown>, after?: () => void) => {
    if (actionBusy.current || loading) return;
    const request = ++actionRevision.current; const screen = revision.current;
    actionBusy.current = true; setBusy(true); setError(false);
    try {
      await operation();
      if (request !== actionRevision.current || screen !== revision.current) return;
      if (after) after(); else await load();
    } catch { if (request === actionRevision.current) setError(true); }
    finally { if (request === actionRevision.current) { actionBusy.current = false; setBusy(false); } }
  };

  if (!detail) return <Screen back title={t('hittingar.manage.title')}><View style={styles.center}>
    <Text accessibilityRole={error ? 'alert' : undefined} style={{ color: error ? theme.colors.danger : theme.colors.textMuted }}>{loading ? t('common.loading') : t('hittingar.errorTitle')}</Text>
    {!loading && <Button label={t('common.retry')} onPress={() => void load()} />}
  </View></Screen>;

  const respond = (request: MeetupRosterEntry, approve: boolean) => runAction(() => meetupApi.respondToMeetupRequest(detail.id, request.profile.id, approve));
  const reinstate = (entry: MeetupRosterEntry, status: MeetupReinstateStatus) => runAction(() => meetupApi.reinstateMeetupParticipant(detail.id, entry.profile.id, status));
  const remove = (request: MeetupRosterEntry) => confirmAction({
    title: t('hittingar.manage.removeTitle', { name: request.profile.displayName }),
    message: t('hittingar.manage.removeBody'),
    cancelLabel: t('common.cancel'),
    confirmLabel: t('hittingar.manage.remove'),
    destructive: true,
    onConfirm: () => runAction(() => meetupApi.removeMeetupParticipant(detail.id, request.profile.id)),
  });
  const cancel = () => confirmAction({
    title: t('hittingar.manage.cancelTitle'),
    message: t('hittingar.manage.cancelBody'),
    cancelLabel: t('common.cancel'),
    confirmLabel: t('hittingar.manage.cancelAction'),
    destructive: true,
    onConfirm: () => runAction(() => meetupApi.cancelMeetup(detail.id), () => router.replace('/hittingar/mine' as Href)),
  });
  const deleteDraft = () => confirmAction({
    title: t('hittingar.manage.deleteTitle'),
    message: t('hittingar.manage.deleteBody'),
    cancelLabel: t('common.cancel'),
    confirmLabel: t('hittingar.manage.deleteAction'),
    destructive: true,
    onConfirm: () => runAction(() => meetupApi.deleteMeetupDraft(detail.id), () => router.replace('/hittingar/mine' as Href)),
  });
  const updateCapacity = async () => {
    const value = capacity ? Number(capacity) : null;
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 1_000)) return;
    await runAction(() => meetupApi.updateMeetup(detail.id, { capacity: value }));
  };

  return (
    <Screen back title={t('hittingar.manage.title')}>
      <View style={styles.page}>
        <PoolSummary pool={detail.pool} />
        {detail.status === 'published' && detail.pool?.status === 'accepting' && <Button label={entitlement && entitlement.tier !== 'plebbi' ? (locale === 'is' ? 'Styrkja hitting' : 'Sponsor meetup') : (locale === 'is' ? 'Skoða áskriftir' : 'Upgrade to sponsor')} onPress={() => router.push((entitlement && entitlement.tier !== 'plebbi' ? `/wallet?meetupId=${encodeURIComponent(detail.id)}` : '/membership') as Href)} />}
        {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('common.error')}</Text>}
        <View style={styles.headingRow}>
          <View style={styles.copy}><Text style={[textStyles.title, { color: theme.colors.text }]}>{detail.title}</Text><Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatHittingurDate(detail.startsAt, locale)}</Text></View>
          <StatusPill label={t(`hittingar.status.${detail.status}`)} tone={detail.status === 'published' ? 'success' : detail.status === 'draft' ? 'warning' : 'danger'} />
        </View>
        {detail.status === 'moderation_hidden' && <SafetyNotice title={t('hittingar.manage.moderationTitle')} tone="danger"><Text style={[styles.meta, { color: theme.colors.textMuted }]}>{t('hittingar.manage.moderationBody')}</Text></SafetyNotice>}
        {detail.status === 'cancelled' && <SafetyNotice title={t('hittingar.manage.cancelledTitle')} tone="danger"><Text style={[styles.meta, { color: theme.colors.textMuted }]}>{t('hittingar.manage.cancelledBody')}</Text></SafetyNotice>}

        {detail.capabilities.canEdit && (
          <View style={styles.section}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.manage.settings')}</Text>
            <Button disabled={busy || loading} label={t('hittingar.manage.edit')} icon="create-outline" variant="secondary" onPress={() => router.push(`/hittingar/create?id=${detail.id}` as Href)} />
            <View style={styles.capacityRow}>
              <View style={styles.copy}><Field label={t('hittingar.create.capacityLabel')} value={capacity} onChangeText={(value) => setCapacity(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={t('hittingar.create.capacityPlaceholder')} /></View>
              <Button label={t('common.save')} loading={busy} disabled={Boolean(capacity) && (Number(capacity) < 1 || Number(capacity) > 1_000)} onPress={() => void updateCapacity()} />
            </View>
          </View>
        )}

        {detail.capabilities.canEdit && <EventMediaGallery id={detail.id} editable />}
        {detail.capabilities.canEdit && detail.status === 'published' && <EventAnnouncements id={detail.id} editable />}
        {detail.capabilities.canManageRequests && <ApplicationInbox id={detail.id} onChanged={load} />}
        {detail.capabilities.canEdit && detail.status === 'published' && <Button variant="secondary" icon="qr-code-outline" label={locale === 'is' ? 'Sýna innritunarkóða' : 'Show check-in code'} onPress={() => router.push(`/check-in?meetupId=${detail.id}` as Href)} />}
        {detail.capabilities.canEdit && detail.eventProfile?.joinMode === 'invite' && <EventInvitations id={detail.id} />}
        {detail.capabilities.canManageRequests && (
          <View style={styles.section}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.manage.people')}</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{t('hittingar.manage.peopleBody')}</Text>
            {participants.length === 0 ? <Text style={[styles.empty, { color: theme.colors.textMuted }]}>{t('hittingar.manage.noRequests')}</Text> : participants.map((request) => (
              <View key={request.profile.id} style={[styles.request, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="person" size={20} color={theme.colors.accent} /></View>
                <View style={styles.copy}>
                  <Text style={[styles.name, { color: theme.colors.text }]}>{request.profile.displayName}</Text>
                  <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{t(`hittingar.request.status.${request.status}`)}</Text>
                </View>
                {request.status === 'pending' ? (
                  <View style={styles.requestActions}>
                    <Button disabled={busy || loading} label={t('hittingar.manage.decline')} variant="ghost" onPress={() => void respond(request, false)} />
                    <Button disabled={busy || loading} label={t('hittingar.manage.approve')} onPress={() => void respond(request, true)} />
                  </View>
                ) : ['approved', 'joined'].includes(request.status) && detail.capabilities.canRemoveParticipants ? (
                  <Button disabled={busy || loading} label={t('hittingar.manage.remove')} variant="danger" onPress={() => remove(request)} />
                ) : ['declined', 'removed'].includes(request.status) ? (
                  <View style={styles.requestActions}>
                    <Button disabled={busy || loading} label={t('hittingar.manage.reinstatePending')} variant="ghost" onPress={() => void reinstate(request, 'pending')} />
                    <Button disabled={busy || loading} label={t('hittingar.manage.reinstateApproved')} onPress={() => void reinstate(request, 'approved')} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.manage.actions')}</Text>
          {detail.status === 'draft' && <Button label={t('hittingar.create.publish')} loading={busy} onPress={() => void runAction(() => meetupApi.publishMeetup(detail.id))} />}
          {detail.capabilities.canCancel && <Button disabled={busy || loading} label={t('hittingar.manage.cancelAction')} variant="danger" onPress={cancel} />}
          {detail.capabilities.canDeleteDraft && <Button disabled={busy || loading} label={t('hittingar.manage.deleteAction')} variant="danger" onPress={deleteDraft} />}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 48, gap: 22 },
  center: { minHeight: 420, alignItems: 'center', justifyContent: 'center' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  copy: { flex: 1, gap: 3 },
  meta: { fontSize: 13, lineHeight: 19 },
  section: { gap: 12 },
  capacityRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  empty: { paddingVertical: 16, textAlign: 'center' },
  request: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800' },
  requestActions: { flexDirection: 'row', gap: 5 },
});
