import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { type Href, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { StraxCreateInput, StraxDetail } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, Field, Screen, textStyles } from '@/components/ui';
import { straxCopy } from '@/i18n/strax';
import { useApp } from '@/providers/AppProvider';
import { straxApi } from '@/services/strax';
import {
  emptyShareSelection,
  hasShareRecipients,
  StraxLogo,
  StraxPhotoPicker,
  StraxSharePicker,
  type ShareSelection,
  type StraxPhoto,
} from '@/features/strax/components';
import { refreshStrax, useStraxResource } from '@/features/strax/hooks';
import { initialStraxForm, straxInput, straxIsActive } from '@/features/strax/model';

export default function CreateStraxScreen() {
  const { theme, locale, user, locationAllowed } = useApp();
  const copy = straxCopy(locale);
  const router = useRouter();
  const [form, setForm] = useState({ ...initialStraxForm });
  const [photo, setPhoto] = useState<StraxPhoto | null>(null);
  const [selection, setSelection] = useState<ShareSelection>({ ...emptyShareSelection });
  const [published, setPublished] = useState<StraxDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [shareSent, setShareSent] = useState(false);
  const publication = useRef<{ id: string; input: StraxCreateInput } | null>(null);
  const publishedRef = useRef<StraxDetail | null>(null);
  const acting = useRef(false);
  const generation = useRef(0);
  const retryShare = useRef<ShareSelection>({ ...emptyShareSelection });
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    generation.current++;
    publication.current = null;
    publishedRef.current = null;
    acting.current = false;
    setForm({ ...initialStraxForm });
    setPhoto(null);
    setSelection({ ...emptyShareSelection });
    setPublished(null);
    setBusy(false);
    setError(null);
    setAttempted(false);
    setPhotoError(false);
    setShareError(false);
    setShareSent(false);
    return () => {
      generation.current++;
    };
  }, [user?.id]);
  const loader = useCallback(async () => {
    const [summary, mine] = await Promise.all([straxApi.summary(), straxApi.mine()]);
    return { ...summary, mine };
  }, []);
  const own = useStraxResource(loader, 'create');
  const existing = own.data?.mine.find((item) => straxIsActive(item, own.now));
  const publishedActive = !!published && straxIsActive(published, own.now);
  const locked = attempted || busy || !!published;
  const upload = async (id: string, revision: number) => {
    if (!photo) return;
    try {
      await straxApi.uploadPhoto(id, photo.uri, photo.mimeType);
      if (revision === generation.current) setPhotoError(false);
    } catch {
      if (revision === generation.current) setPhotoError(true);
    }
  };
  const share = async (id: string, destinations: ShareSelection, revision: number) => {
    if (!hasShareRecipients(destinations)) return;
    try {
      const result = await straxApi.share(id, destinations);
      if (revision !== generation.current) return;
      retryShare.current = {
        allFriends: false,
        friendIds: result.failed.filter((item) => item.type === 'friend').map((item) => item.id),
        groupIds: result.failed.filter((item) => item.type === 'group').map((item) => item.id),
      };
      setShareError(result.failed.length > 0);
      setShareSent(result.sent.length > 0 || result.failed.length === 0);
    } catch {
      if (revision === generation.current) {
        retryShare.current = destinations;
        setShareError(true);
      }
    }
  };
  const publish = async () => {
    if (acting.current || publishedRef.current || !user || !locationAllowed) return;
    const input = straxInput(form);
    if (!input) {
      setError(copy.validation);
      return;
    }
    const revision = generation.current;
    publication.current ??= { id: Crypto.randomUUID(), input };
    acting.current = true;
    setBusy(true);
    setError(null);
    setAttempted(true);
    try {
      const result = await straxApi.create(publication.current.input, publication.current.id);
      if (revision !== generation.current) return;
      // Publication is retained before optional work. A photo/share failure can never create another listing.
      publishedRef.current = result;
      setPublished(result);
      own.anchorServerTime(result.serverNow);
      refreshStrax();
      await Promise.all([upload(result.id, revision), share(result.id, selection, revision)]);
      refreshStrax();
    } catch (failure) {
      if (revision === generation.current) {
        const message =
          failure && typeof failure === 'object' && 'message' in failure
            ? String(failure.message)
            : String(failure);
        const alreadyActive = /already.*active|active.*(exists|limit)|one_active/i.test(message);
        setError(alreadyActive ? copy.alreadyActive : copy.actionError);
        if (alreadyActive) await own.reload();
        else if (
          /invalid_|validation|strax_.*(?:too_long|invalid|host_unavailable)|fresh_iceland_location_required/i.test(
            message,
          )
        ) {
          // A definitive rejection can be edited safely. Unknown outcomes keep
          // the same request and payload so a retry cannot publish a duplicate.
          publication.current = null;
          setAttempted(false);
        }
      }
    } finally {
      if (revision === generation.current) {
        acting.current = false;
        setBusy(false);
      }
    }
  };
  const retryOptional = async (kind: 'photo' | 'share') => {
    if (!publishedRef.current || acting.current || !publishedActive) return;
    const revision = generation.current;
    acting.current = true;
    setBusy(true);
    try {
      if (kind === 'photo') await upload(publishedRef.current.id, revision);
      else await share(publishedRef.current.id, retryShare.current, revision);
      refreshStrax();
    } finally {
      if (revision === generation.current) {
        acting.current = false;
        setBusy(false);
      }
    }
  };
  if (!locationAllowed)
    return (
      <Screen back title={copy.create}>
        <View style={styles.form}>
          <Text style={{ color: theme.colors.textMuted }}>
            {locale === 'is'
              ? 'Staðfestu staðsetningu til að nota Strax.'
              : 'Verify your location to use Strax.'}
          </Text>
          <Button
            label={locale === 'is' ? 'Staðfesta staðsetningu' : 'Verify location'}
            onPress={() => router.push('/location-gate')}
          />
        </View>
      </Screen>
    );
  return (
    <Screen
      back
      title={copy.create}
      footer={
        <Button
          label={published ? copy.view : copy.publish}
          icon={published ? 'arrow-forward' : 'flash-outline'}
          loading={busy}
          onPress={() =>
            published ? router.replace(`/hittingar/strax/${published.id}` as Href) : void publish()
          }
          disabled={!published && !!existing}
        />
      }
    >
      <View style={styles.form}>
        <View style={styles.heading}>
          <StraxLogo size={38} />
          <View style={{ flex: 1 }}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{copy.tagline}</Text>
            <Text style={{ color: theme.colors.textMuted, lineHeight: 20 }}>
              {copy.expiresHint}
            </Text>
          </View>
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        )}
        {published ? (
          <View style={[styles.notice, { backgroundColor: theme.colors.accentSoft }]}>
            <Text
              accessibilityLiveRegion="polite"
              style={[textStyles.heading, { color: theme.colors.text }]}
            >
              {publishedActive ? copy.published : copy.expired}
            </Text>
            <Text style={{ color: theme.colors.text }}>{published.title}</Text>
            {photoError ? (
              <>
                <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
                  {copy.photoError}
                </Text>
                <Button
                  variant="secondary"
                  label={copy.retryPhoto}
                  disabled={busy || !publishedActive}
                  onPress={() => void retryOptional('photo')}
                />
              </>
            ) : (
              photo && <Text style={{ color: theme.colors.textMuted }}>{copy.photoPending}</Text>
            )}
            {shareError && (
              <>
                <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
                  {copy.shareError}
                </Text>
                <Button
                  variant="secondary"
                  label={copy.retryShare}
                  disabled={busy || !publishedActive}
                  onPress={() => void retryOptional('share')}
                />
              </>
            )}
            {shareSent && <Text style={{ color: theme.colors.accent }}>{copy.shareSent}</Text>}
          </View>
        ) : existing ? (
          <View style={[styles.notice, { backgroundColor: theme.colors.accentSoft }]}>
            <Text style={{ color: theme.colors.text }}>{copy.alreadyActive}</Text>
            <Button
              label={copy.view}
              onPress={() => router.replace(`/hittingar/strax/${existing.id}` as Href)}
            />
          </View>
        ) : (
          <>
            <Field
              label={copy.name}
              value={form.title}
              onChangeText={(title) => setForm({ ...form, title })}
              maxLength={60}
              placeholder={copy.nameHint}
              editable={!locked}
            />
            <Field
              label={copy.description}
              value={form.description}
              onChangeText={(description) => setForm({ ...form, description })}
              maxLength={600}
              placeholder={copy.descriptionHint}
              multiline
              editable={!locked}
            />
            <Button
              variant="ghost"
              disabled={locked}
              label={copy.dmShortcut}
              onPress={() => setForm({ ...form, description: copy.dmText })}
            />
            <View style={styles.choices}>
              <ChoiceChip
                label={copy.inPerson}
                selected={form.venueMode === 'in_person'}
                onPress={() => !locked && setForm({ ...form, venueMode: 'in_person' })}
              />
              <ChoiceChip
                label={copy.online}
                selected={form.venueMode === 'online'}
                onPress={() => !locked && setForm({ ...form, venueMode: 'online' })}
              />
            </View>
            <Field
              label={copy.location}
              value={form.locationText}
              onChangeText={(locationText) => setForm({ ...form, locationText })}
              maxLength={200}
              editable={!locked}
            />
            {form.venueMode === 'in_person' && (
              <>
                <Field
                  label={copy.address}
                  value={form.address}
                  onChangeText={(address) => setForm({ ...form, address })}
                  maxLength={300}
                  editable={!locked}
                />
                <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
                  {copy.addressHint}
                </Text>
              </>
            )}
            <Field
              label={copy.requirements}
              value={form.requirements}
              onChangeText={(requirements) => setForm({ ...form, requirements })}
              maxLength={600}
              placeholder={copy.requirementsHint}
              multiline
              editable={!locked}
            />
            <Field
              label={copy.capacity}
              value={form.capacity}
              onChangeText={(capacity) => setForm({ ...form, capacity })}
              maxLength={2}
              keyboardType="number-pad"
              editable={!locked}
            />
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              {copy.capacityHint}
            </Text>
            <Text style={[styles.label, { color: theme.colors.text }]}>{copy.joinMode}</Text>
            <View style={styles.choices}>
              <ChoiceChip
                label={copy.application}
                selected={form.joinMode === 'application'}
                onPress={() => !locked && setForm({ ...form, joinMode: 'application' })}
              />
              <ChoiceChip
                label={copy.open}
                selected={form.joinMode === 'open'}
                onPress={() => !locked && setForm({ ...form, joinMode: 'open' })}
              />
            </View>
            {form.joinMode === 'application' && (
              <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
                {copy.applicationHint}
              </Text>
            )}
            <StraxPhotoPicker photo={photo} onChange={setPhoto} disabled={locked} />
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{copy.publicHint}</Text>
            <StraxSharePicker value={selection} onChange={setSelection} disabled={locked} />
          </>
        )}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  form: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 18, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '700' },
  notice: { padding: 16, borderRadius: 12, gap: 12 },
});
