import { useCallback, useEffect, useRef, useState } from 'react';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { StraxRosterEntry } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, EmptyState, Field, Screen, textStyles } from '@/components/ui';
import { straxCopy } from '@/i18n/strax';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { straxApi } from '@/services/strax';
import {
  emptyShareSelection,
  hasShareRecipients,
  StraxCheck,
  StraxCountdown,
  StraxLogo,
  StraxPhotoPicker,
  StraxSharePicker,
  type ShareSelection,
  type StraxPhoto,
} from '@/features/strax/components';
import { refreshStrax, useStraxResource } from '@/features/strax/hooks';
import { straxIsActive } from '@/features/strax/model';
import { confirmAction } from '@/utils/confirmAction';

export default function StraxDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? (params.id[0] ?? '') : params.id;
  const { theme, locale, user, locationAllowed } = useApp();
  const copy = straxCopy(locale);
  const router = useRouter();
  const [introduction, setIntroduction] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [selection, setSelection] = useState<ShareSelection>({ ...emptyShareSelection });
  const [shareError, setShareError] = useState(false);
  const [shareSent, setShareSent] = useState(false);
  const [photo, setPhoto] = useState<StraxPhoto | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const failedShares = useRef<ShareSelection | null>(null);
  const loader = useCallback(async () => {
    const item = await straxApi.get(id);
    let roster: StraxRosterEntry[] = [];
    let rosterError = false;
    if (item.viewerState === 'host') {
      try {
        roster = await straxApi.roster(id);
      } catch {
        rosterError = true;
      }
    }
    return { item, roster, rosterError, serverNow: item.serverNow };
  }, [id]);
  const resource = useStraxResource(loader, `detail:${id}`);
  const item = resource.data?.item;
  const active = !!item && straxIsActive(item, resource.now);
  const host = item?.viewerState === 'host';
  useEffect(() => {
    generation.current++;
    pending.current = false;
    setBusy(false);
    setError(false);
    setIntroduction('');
    setAcknowledged(false);
    setPhoto(null);
    setPhotoError(false);
    setSelection({ ...emptyShareSelection });
    setShareSent(false);
    setShareError(false);
    failedShares.current = null;
    setReportOpen(false);
    setNotes('');
    setReportSent(false);
    return () => {
      generation.current++;
    };
  }, [id, user?.id, locationAllowed]);
  const run = async (operation: () => Promise<unknown>, onSuccess?: () => void) => {
    if (pending.current || !active || !locationAllowed) return;
    const revision = generation.current;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      await operation();
      if (revision === generation.current) {
        onSuccess?.();
        refreshStrax();
        await resource.reload();
      }
    } catch {
      if (revision === generation.current) setError(true);
    } finally {
      if (revision === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  const share = () => {
    const revision = generation.current;
    return run(async () => {
      const targets = failedShares.current ?? selection;
      let result;
      try {
        result = await straxApi.share(id, targets);
      } catch (failure) {
        if (revision === generation.current) {
          failedShares.current = targets;
          setShareError(true);
        }
        throw failure;
      }
      if (revision !== generation.current) return;
      failedShares.current = result.failed.length
        ? {
            allFriends: false,
            friendIds: result.failed
              .filter((target) => target.type === 'friend')
              .map((target) => target.id),
            groupIds: result.failed
              .filter((target) => target.type === 'group')
              .map((target) => target.id),
          }
        : null;
      setShareError(result.failed.length > 0);
      setShareSent(result.sent.length > 0 || !result.failed.length);
    });
  };
  const upload = () => {
    if (!photo) return;
    const revision = generation.current;
    return run(async () => {
      try {
        await straxApi.uploadPhoto(id, photo.uri, photo.mimeType);
        if (revision === generation.current) {
          setPhotoError(false);
          setPhoto(null);
        }
      } catch (failure) {
        if (revision === generation.current) setPhotoError(true);
        throw failure;
      }
    });
  };
  const close = () =>
    confirmAction({
      title: copy.closeTitle,
      message: copy.closeBody,
      cancelLabel: copy.cancel,
      confirmLabel: copy.close,
      destructive: true,
      onConfirm: () => run(() => straxApi.close(id)),
    });
  const remove = (row: StraxRosterEntry) =>
    confirmAction({
      title: `${copy.remove}: ${row.displayName}?`,
      message:
        locale === 'is' ? 'Plássið verður aftur laust.' : 'Their place becomes available again.',
      cancelLabel: copy.cancel,
      confirmLabel: copy.remove,
      destructive: true,
      onConfirm: () => run(() => straxApi.decide(id, row.profileId, 'remove')),
    });
  const message = () => {
    const revision = generation.current;
    return run(async () => {
      if (!item) return;
      const conversationId = await api.startConversation(item.host.id);
      if (revision === generation.current)
        router.push({
          pathname: '/chat/[id]',
          params: { id: conversationId, name: item.host.displayName, profileId: item.host.id },
        });
    });
  };
  if (!locationAllowed)
    return (
      <Screen back title="Strax">
        <View style={styles.page}>
          <Text style={{ color: theme.colors.textMuted }}>
            {locale === 'is'
              ? 'Staðfestu staðsetningu til að skoða Strax.'
              : 'Verify your location to view Strax.'}
          </Text>
          <Button
            label={locale === 'is' ? 'Staðfesta staðsetningu' : 'Verify location'}
            onPress={() => router.push('/location-gate')}
          />
        </View>
      </Screen>
    );
  if (!item)
    return (
      <Screen back title="Strax">
        <View style={styles.page}>
          {resource.loading ? (
            <ActivityIndicator accessibilityLabel={copy.loading} color={theme.colors.accent} />
          ) : (
            <EmptyState
              icon="flash-outline"
              title={copy.unavailable}
              body={copy.unavailableHint}
              action={<Button label={copy.retry} onPress={() => void resource.reload()} />}
            />
          )}
          <Button
            label={copy.active}
            variant="secondary"
            onPress={() => router.replace('/(tabs)/hittingar?section=strax' as Href)}
          />
        </View>
      </Screen>
    );
  if (!active && item.viewerState === 'none')
    return (
      <Screen back title="Strax">
        <View style={styles.page}>
          <EmptyState
            icon="time-outline"
            title={item.status === 'closed' ? copy.closed : copy.expired}
            body={copy.expiredHint}
            action={
              <Button
                label={copy.active}
                onPress={() => router.replace('/(tabs)/hittingar?section=strax' as Href)}
              />
            }
          />
        </View>
      </Screen>
    );
  const pendingRows = resource.data?.roster.filter((row) => row.status === 'pending') ?? [];
  const joinedRows = resource.data?.roster.filter((row) => row.status === 'joined') ?? [];
  const needsAcknowledgement = !!item.requirements?.trim();
  const places =
    item.spacesNeeded === null ? null : Math.max(0, item.spacesNeeded - item.participantCount);
  const canParticipate =
    active && (item.viewerCapabilities.canApply || item.viewerCapabilities.canJoin);
  return (
    <Screen back title="Strax" right={<StraxLogo size={23} />}>
      <View style={styles.page}>
        <StraxCountdown item={item} now={resource.now} />
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>
          {item.title}
        </Text>
        <Text style={{ color: theme.colors.textMuted }}>
          {item.host.displayName} ·{' '}
          {item.venueMode === 'online' ? copy.online : item.locationText || copy.inPerson}
        </Text>
        {active && item.photoUrl && (
          <Image
            source={item.photoUrl}
            accessibilityLabel={item.title}
            contentFit="cover"
            style={styles.cover}
          />
        )}
        {!active && (
          <View style={[styles.panel, { backgroundColor: theme.colors.accentSoft }]}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>
              {item.status === 'closed' ? copy.closed : copy.expired}
            </Text>
            <Text style={{ color: theme.colors.textMuted, lineHeight: 20 }}>
              {copy.expiredHint}
            </Text>
            <Button
              label={copy.active}
              variant="secondary"
              onPress={() => router.replace('/(tabs)/hittingar?section=strax' as Href)}
            />
          </View>
        )}
        {(error || resource.error) && (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
              {error ? copy.actionError : copy.loadError}
            </Text>
            <Button
              label={copy.refresh}
              variant="secondary"
              disabled={busy}
              onPress={() => void resource.reload()}
            />
          </View>
        )}
        <Text style={[styles.body, { color: theme.colors.text }]}>{item.description}</Text>
        {!!item.address && (
          <View style={[styles.panel, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.heading, { color: theme.colors.text }]}>{copy.address}</Text>
            <Text style={[styles.body, { color: theme.colors.text }]}>{item.address}</Text>
          </View>
        )}
        {!!item.requirements && (
          <View style={[styles.panel, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.heading, { color: theme.colors.text }]}>{copy.requirements}</Text>
            <Text style={[styles.body, { color: theme.colors.text }]}>{item.requirements}</Text>
          </View>
        )}
        <View style={[styles.panel, { backgroundColor: theme.colors.surface }]}>
          <Text style={{ color: theme.colors.textMuted }}>
            {copy.participantCount(item.participantCount)}
            {active && places !== null ? ` · ${places ? copy.placesCount(places) : copy.full}` : ''}
          </Text>
          {item.viewerState === 'pending' && (
            <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.accent }}>
              {active ? copy.pending : copy.applicationEnded}
            </Text>
          )}
          {item.viewerState === 'joined' && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: theme.colors.accent, fontWeight: '700' }}
            >
              {active ? copy.joined : copy.participationEnded}
            </Text>
          )}
          {item.viewerState === 'declined' && (
            <Text style={{ color: theme.colors.textMuted }}>{copy.declined}</Text>
          )}
          {canParticipate && (
            <>
              {item.joinMode === 'application' && (
                <Field
                  label={copy.introduction}
                  value={introduction}
                  onChangeText={setIntroduction}
                  maxLength={1000}
                  multiline
                  editable={!busy}
                />
              )}
              {needsAcknowledgement && (
                <StraxCheck
                  label={copy.acknowledge}
                  checked={acknowledged}
                  disabled={busy}
                  onPress={() => setAcknowledged(!acknowledged)}
                />
              )}
              <Button
                icon={
                  item.joinMode === 'application' ? 'paper-plane-outline' : 'add-circle-outline'
                }
                label={item.joinMode === 'application' ? copy.apply : copy.join}
                loading={busy}
                disabled={needsAcknowledgement && !acknowledged}
                onPress={() =>
                  void run(() =>
                    straxApi.participate(
                      id,
                      introduction.trim(),
                      acknowledged || !needsAcknowledgement,
                    ),
                  )
                }
              />
            </>
          )}
          {active && item.viewerCapabilities.canWithdraw && (
            <Button
              label={copy.withdraw}
              variant="secondary"
              loading={busy}
              onPress={() => void run(() => straxApi.leave(id))}
            />
          )}
          {active && item.viewerCapabilities.canLeave && (
            <Button
              label={copy.leave}
              variant="secondary"
              loading={busy}
              onPress={() => void run(() => straxApi.leave(id))}
            />
          )}
          {active && !host && (
            <Button
              label={copy.message}
              icon="chatbubble-outline"
              variant="ghost"
              disabled={busy}
              onPress={() => void message()}
            />
          )}
        </View>
        {host && (
          <>
            <Text
              accessibilityRole="header"
              style={[textStyles.heading, { color: theme.colors.text }]}
            >
              {copy.manage}
            </Text>
            <View style={[styles.panel, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.heading, { color: theme.colors.text }]}>{copy.requests}</Text>
              {resource.data?.rosterError && (
                <>
                  <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
                    {copy.loadError}
                  </Text>
                  <Button
                    label={copy.retry}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void resource.reload()}
                  />
                </>
              )}
              {!resource.data?.rosterError && !pendingRows.length && (
                <Text style={{ color: theme.colors.textMuted }}>{copy.noRequests}</Text>
              )}
              {pendingRows.map((row) => (
                <View
                  key={row.profileId}
                  style={[styles.person, { borderColor: theme.colors.border }]}
                >
                  <Text style={[styles.heading, { color: theme.colors.text }]}>
                    {row.displayName}
                  </Text>
                  {!!row.introduction && (
                    <Text style={[styles.body, { color: theme.colors.textMuted }]}>
                      {row.introduction}
                    </Text>
                  )}
                  {active && (
                    <View style={styles.actions}>
                      <Button
                        label={copy.approve}
                        disabled={busy || places === 0}
                        onPress={() =>
                          void run(() => straxApi.decide(id, row.profileId, 'approve'))
                        }
                      />
                      <Button
                        label={copy.decline}
                        disabled={busy}
                        variant="secondary"
                        onPress={() =>
                          void run(() => straxApi.decide(id, row.profileId, 'decline'))
                        }
                      />
                    </View>
                  )}
                </View>
              ))}
              <Text style={[styles.heading, { color: theme.colors.text }]}>{copy.roster}</Text>
              {!resource.data?.rosterError && !joinedRows.length && (
                <Text style={{ color: theme.colors.textMuted }}>{copy.noParticipants}</Text>
              )}
              {joinedRows.map((row) => (
                <View
                  key={row.profileId}
                  style={[styles.person, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>{row.displayName}</Text>
                  {active && (
                    <Button
                      label={copy.remove}
                      disabled={busy}
                      variant="ghost"
                      onPress={() => remove(row)}
                    />
                  )}
                </View>
              ))}
            </View>
            {active && item.viewerCapabilities.canManage && (
              <>
                {item.photoStatus === 'pending' && (
                  <Text style={{ color: theme.colors.textMuted }}>{copy.photoPending}</Text>
                )}
                {item.photoStatus === 'rejected' && (
                  <Text style={{ color: theme.colors.danger }}>{copy.photoRejected}</Text>
                )}
                {(item.photoStatus === 'none' || item.photoStatus === 'rejected') && (
                  <StraxPhotoPicker photo={photo} onChange={setPhoto} disabled={busy} />
                )}
                {photoError && (
                  <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
                    {copy.photoError}
                  </Text>
                )}
                {!!photo && (item.photoStatus === 'none' || item.photoStatus === 'rejected') && (
                  <Button
                    label={photoError ? copy.retryPhoto : copy.addPhoto}
                    disabled={busy}
                    onPress={() => void upload()}
                  />
                )}
                <StraxSharePicker
                  value={selection}
                  onChange={(next) => {
                    setSelection(next);
                    failedShares.current = null;
                    setShareError(false);
                    setShareSent(false);
                  }}
                  disabled={busy}
                />
                {shareError && (
                  <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
                    {copy.shareError}
                  </Text>
                )}
                {shareSent && (
                  <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.accent }}>
                    {copy.shareSent}
                  </Text>
                )}
                <Button
                  label={shareError ? copy.retryShare : copy.send}
                  disabled={busy || !hasShareRecipients(failedShares.current ?? selection)}
                  onPress={() => void share()}
                  variant="secondary"
                />
                <Button label={copy.close} disabled={busy} variant="danger" onPress={close} />
              </>
            )}
          </>
        )}
        {active && !host && !reportSent && (
          <Button
            label={copy.report}
            variant="ghost"
            disabled={busy}
            onPress={() => setReportOpen(!reportOpen)}
          />
        )}
        {reportOpen && !reportSent && (
          <View style={[styles.panel, { backgroundColor: theme.colors.surface }]}>
            <Field
              label={copy.reportNotes}
              value={notes}
              onChangeText={setNotes}
              maxLength={2000}
              multiline
              editable={!busy}
            />
            <Button
              label={copy.report}
              disabled={busy || !notes.trim() || !active}
              onPress={() =>
                void run(
                  () => straxApi.report(id, notes.trim()),
                  () => {
                    setReportSent(true);
                    setReportOpen(false);
                  },
                )
              }
            />
            <Button label={copy.cancel} variant="ghost" onPress={() => setReportOpen(false)} />
          </View>
        )}
        {reportSent && (
          <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.accent }}>
            {copy.reportSent}
          </Text>
        )}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 16 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800' },
  heading: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 23 },
  cover: { width: '100%', height: 240, borderRadius: 12 },
  panel: { borderRadius: 12, padding: 16, gap: 12 },
  person: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
