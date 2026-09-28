import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StartupGate } from '@/components/StartupGate';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, Field, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api, runtimeEnv } from '@/services';
import * as Linking from 'expo-linking';
import type { Identity, IcelandRegion, Intent, ProfileSocial } from '@/types/domain';
import { parseProfileList, socialPlatforms, updateSocialHandle } from '@/utils/profileExtras';
import { isAtLeast18, parseDateOnly } from '@/utils/age';

const identities: Identity[] = ['gay', 'bi', 'queer', 'trans', 'nonbinary', 'lesbian'];
const intents: Intent[] = ['chat', 'dates', 'friends', 'relationship'];
const regions: IcelandRegion[] = ['capital', 'south', 'west', 'westfjords', 'north', 'east'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { locale, setLocale, t, theme, verifyLocation } = useApp();
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setChecking(true); setCheckFailed(false);
    void api.hasCompletedOnboarding().then(completed => {
      if (!active) return;
      if (completed && !api.isDemo) router.replace('/(tabs)/discover');
      else setChecking(false);
    }).catch(() => { if (active) { setChecking(false); setCheckFailed(true); } });
    return () => { active = false; };
  }, [checkAttempt, router]);
  const [dob, setDob] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [guidelines, setGuidelines] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [identity, setIdentity] = useState<Identity[]>([]);
  const [lookingFor, setLookingFor] = useState<Intent[]>([]);
  const [bio, setBio] = useState('');
  const [videos, setVideos] = useState<string[]>([]);
  const [socials, setSocials] = useState<ProfileSocial[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [region, setRegion] = useState<IcelandRegion>('capital');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const valid = useMemo(() => {
    if (step === 1) return parseDateOnly(dob) !== null && isAtLeast18(dob);
    if (step === 2) return terms && privacy && guidelines && sensitive;
    if (step === 3) return displayName.trim().length >= 2 && identity.length > 0 && lookingFor.length > 0;
    return true;
  }, [displayName, dob, guidelines, identity.length, lookingFor.length, privacy, sensitive, step, terms]);

  const toggle = <T,>(value: T, values: T[], setValues: (values: T[]) => void) =>
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

  const next = async () => {
    if (loading) return;
    setError('');
    if (step === 1 && (parseDateOnly(dob) === null || !isAtLeast18(dob))) {
      setError(parseDateOnly(dob) ? t('onboarding.underage') : t('onboarding.invalidDob'));
      return;
    }
    if (!valid) return setError(t('onboarding.required'));
    if (step < 3) return setStep((value) => value + 1);
    if (step === 3) {
      setLoading(true);
      try {
        await api.completeOnboarding({
          dateOfBirth: dob,
          displayName: displayName.trim(),
          pronouns: pronouns.trim() || undefined,
          identity,
          lookingFor,
          bio: bio.trim(),
          videos,
          socials,
          interests,
          region,
          sensitiveDataConsent: sensitive,
          privacyAccepted: privacy,
          termsAccepted: terms,
          guidelinesAccepted: guidelines,
          locale,
        });
        setStep(4);
      } catch {
        setError(t('common.error'));
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    const result = await verifyLocation();
    setLoading(false);
    if (result === 'verified') router.replace('/(tabs)/discover');
    else if (result === 'denied') setError(t('location.deniedBody'));
    else if (result === 'outside_iceland') setError(t('location.outsideBody'));
    else if (result === 'poor_accuracy') setError(t('location.accuracyBody'));
    else setError(t('location.serverBody'));
  };

  const copy = [
    ['onboarding.languageEyebrow', 'onboarding.languageTitle', 'onboarding.languageBody'],
    ['onboarding.dobEyebrow', 'onboarding.dobTitle', 'onboarding.dobBody'],
    ['onboarding.consentEyebrow', 'onboarding.consentTitle', 'onboarding.consentBody'],
    ['onboarding.profileEyebrow', 'onboarding.profileTitle', 'onboarding.profileBody'],
    ['onboarding.locationEyebrow', 'onboarding.locationTitle', 'onboarding.locationBody'],
  ] as const;
  const current = copy[step] ?? copy[0];

  if (checking) return <StartupGate />;
  if (checkFailed) return <StartupGate unavailable retry={() => setCheckAttempt(value => value + 1)} />;
  return (
    <Screen back={step > 0 && step < 4} onBack={() => { if (!loading) setStep(value => Math.max(0, value - 1)); }}>
      <View style={styles.page}>
        <View style={styles.progressRow}>
          <View style={styles.progress}>{copy.map((_, index) => <View key={index} style={[styles.progressItem, { backgroundColor: index <= step ? theme.colors.accent : theme.colors.border }]} />)}</View>
          <Text style={[styles.stepCount, { color: theme.colors.textMuted }]}>{step + 1}/{copy.length}</Text>
        </View>
        <View style={[styles.eyebrowIcon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name={step === 0 ? 'language-outline' : step === 1 ? 'calendar-outline' : step === 2 ? 'shield-checkmark-outline' : step === 3 ? 'person-outline' : 'location-outline'} size={22} color={theme.colors.accent} /></View>
        <Text style={[textStyles.eyebrow, { color: theme.colors.lava }]}>{t(current[0])}</Text>
        <Text style={[textStyles.title, { color: theme.colors.text }]}>{t(current[1])}</Text>
        <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t(current[2])}</Text>

        <View style={styles.stepBody}>
          {step === 0 && (
            <View style={styles.languageGrid}>
              {(['is', 'en'] as const).map((value) => (
                <Pressable key={value} onPress={() => setLocale(value)} style={({ pressed }) => [styles.languageCard, { borderColor: locale === value ? theme.colors.accent : theme.colors.border, backgroundColor: locale === value ? theme.colors.accentSoft : theme.colors.surface }, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.flag}>{value === 'is' ? '🇮🇸' : '🌍'}</Text>
                  <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t(value === 'is' ? 'onboarding.icelandic' : 'onboarding.english')}</Text>
                  {locale === value && <Ionicons name="checkmark-circle" size={24} color={theme.colors.accent} />}
                </Pressable>
              ))}
            </View>
          )}
          {step === 1 && <Field label={t('onboarding.dobLabel')} value={dob} onChangeText={setDob} keyboardType="numbers-and-punctuation" placeholder={t('onboarding.dobPlaceholder')} />}
          {step === 2 && (
            <View style={styles.checkList}>
              {runtimeEnv.websiteUrl && ([['terms', 'support.terms'], ['privacy', 'support.privacyNotice'], ['community', 'support.guidelines']] as const).map(([path, label]) => <Button key={path} variant="secondary" icon="open-outline" label={t(label)} onPress={() => { void Linking.openURL(runtimeEnv.websiteUrl + '/' + path + (locale === 'en' ? '?lang=en' : '')).catch(() => setError(t('support.linkFailed'))); }} />)}
              {[
                [terms, setTerms, 'onboarding.terms'],
                [privacy, setPrivacy, 'settings.privacy'],
                [guidelines, setGuidelines, 'onboarding.guidelines'],
                [sensitive, setSensitive, 'onboarding.sensitive'],
              ].map(([checked, setter, key]) => (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(checked) }} key={String(key)} onPress={() => (setter as (value: boolean) => void)(!checked)} style={[styles.checkRow, { borderColor: checked ? theme.colors.accent : theme.colors.border, backgroundColor: checked ? theme.colors.accentSoft : theme.colors.surface }]}>
                  <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? theme.colors.accent : theme.colors.textMuted} />
                  <Text style={[styles.checkCopy, { color: theme.colors.text }]}>{t(key as Parameters<typeof t>[0])}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {step === 3 && (
            <View style={styles.form}>
              <Field label={t('profile.name')} value={displayName} onChangeText={setDisplayName} placeholder={t('profile.namePlaceholder')} />
              <Field label={t('profile.pronouns')} value={pronouns} onChangeText={setPronouns} placeholder={t('profile.pronounsPlaceholder')} />
              <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.identity')}</Text>
              <View style={styles.chips}>{identities.map((item) => <ChoiceChip key={item} label={t(`identity.${item}`)} selected={identity.includes(item)} onPress={() => toggle(item, identity, setIdentity)} />)}</View>
              <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.lookingFor')}</Text>
              <View style={styles.chips}>{intents.map((item) => <ChoiceChip key={item} label={t(`intent.${item}`)} selected={lookingFor.includes(item)} onPress={() => toggle(item, lookingFor, setLookingFor)} />)}</View>
              <Field label={t('profile.bio')} value={bio} onChangeText={setBio} multiline placeholder={t('profile.bioPlaceholder')} />
              <View style={styles.optionalBlock}>
                <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.videos')}</Text>
                <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.videosHint')}</Text>
                <Field label={t('profile.videoLinks')} value={videos.join('\n')} onChangeText={(value) => setVideos(parseProfileList(value, 3))} placeholder={t('profile.videoLinksPlaceholder')} multiline />
              </View>
              <View style={styles.optionalBlock}>
                <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.socials')}</Text>
                <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.socialsHint')}</Text>
                {socialPlatforms.map(({ platform, labelKey }) => (
                  <Field
                    key={platform}
                    label={t(labelKey)}
                    value={socials.find((social) => social.platform === platform)?.handle ?? ''}
                    onChangeText={(value) => setSocials((current) => updateSocialHandle(current, platform, value))}
                  />
                ))}
              </View>
              <View style={styles.optionalBlock}>
                <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.interests')}</Text>
                <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('profile.interestsHint')}</Text>
                <Field label={t('profile.interests')} value={interests.join(', ')} onChangeText={(value) => setInterests(parseProfileList(value, 12))} placeholder={t('profile.interestsPlaceholder')} multiline />
              </View>
              <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>{t('profile.region')}</Text>
              <View style={styles.chips}>{regions.map((item) => <ChoiceChip key={item} label={t(`region.${item}`)} selected={region === item} onPress={() => setRegion(item)} />)}</View>
            </View>
          )}
          {step === 4 && (
            <View style={[styles.locationCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={[styles.locationIcon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="location" size={36} color={theme.colors.accent} /></View>
              <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('onboarding.locationPrivacy')}</Text>
              <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('location.lockedHint')}</Text>
            </View>
          )}
        </View>
        {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>}
        <Button loading={loading} disabled={!valid} icon={step === 4 ? 'location-outline' : undefined} label={step === 4 ? t('onboarding.locationAction') : t('common.continue')} onPress={() => void next()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, gap: 12, flex: 1, maxWidth: 620, width: '100%', alignSelf: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  progressItem: { flex: 1, height: 4, borderRadius: 2 },
  stepCount: { fontSize: 12, fontWeight: '800' },
  eyebrowIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  stepBody: { flex: 1, paddingVertical: 18 },
  languageGrid: { gap: 12 },
  languageCard: { minHeight: 110, borderWidth: 2, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  flag: { fontSize: 35 },
  checkList: { gap: 10 },
  checkRow: { borderWidth: 1, borderRadius: 18, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  checkCopy: { flex: 1, fontSize: 15, lineHeight: 22 },
  form: { gap: 18 },
  optionalBlock: { gap: 10 },
  hint: { fontSize: 12, lineHeight: 17 },
  sectionLabel: { fontSize: 14, fontWeight: '800', marginBottom: -8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationCard: { minHeight: 260, borderWidth: 1, borderRadius: 26, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  locationIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
