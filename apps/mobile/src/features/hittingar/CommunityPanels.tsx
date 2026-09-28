import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import type { CommunityState, CommunityHostSummary, CommunityApplication, CommunityAnnouncement, MeetupDetail } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, Field, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { communityApi } from '@/services/community';
import { EventCover } from './EventCover';
import { formatHittingurDate } from './components';

type FollowState = CommunityState['follows']['event'];
function useCopy() { const { locale } = useApp(); return (is: string, en: string) => locale === 'is' ? is : en; }

export function CommunityError() {
  const { theme } = useApp(); const c = useCopy();
  return <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{c('Ekki tókst að ljúka aðgerðinni. Reyndu aftur.', 'This could not be completed. Please try again.')}</Text>;
}

export function FollowControl({ type, id, value, label, onChanged }: {
  type: 'host' | 'event' | 'series'; id: string; value: FollowState; label: string; onChanged: () => Promise<unknown>;
}) {
  const { theme } = useApp(); const c = useCopy();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const save = async (following: boolean, notifications: boolean) => {
    if (busy) return; setBusy(true); setError(false);
    try { await communityApi.setFollow(type, id, following, notifications); await onChanged(); }
    catch { setError(true); } finally { setBusy(false); }
  };
  return <View style={{ gap: 8 }}>
    <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{label} · {value.count} {c('fylgjendur', 'followers')}</Text>
    <Button label={value.following ? c('Hætta að fylgja', 'Unfollow') : c('Fylgja', 'Follow')} icon={value.following ? 'checkmark-circle-outline' : 'add-circle-outline'} variant={value.following ? 'secondary' : 'primary'} disabled={busy} onPress={() => void save(!value.following, true)} />
    {value.following && <ChoiceChip label={value.notifications ? c('Tilkynningar virkar', 'Notifications on') : c('Tilkynningar óvirkar', 'Notifications off')} selected={value.notifications} onPress={() => { if (!busy) void save(true, !value.notifications); }} />}
    {error && <CommunityError />}
  </View>;
}

export function EventFollowing({ detail, value, reload }: { detail: MeetupDetail; value: CommunityState; reload: () => Promise<unknown> }) {
  const { theme, user } = useApp(); const c = useCopy();
  return <View style={{ padding: 16, gap: 16, borderRadius: 20, backgroundColor: theme.colors.surface }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{c('Fylgstu með', 'Stay connected')}</Text>
    <Text style={{ color: theme.colors.textMuted, lineHeight: 21 }}>{c('Það er ókeypis að fylgja. Það skráir þig ekki á hittinginn og nöfn fylgjenda eru ekki birt.', 'Following is free. It does not reserve a place, and follower identities stay private.')}</Text>
    <FollowControl type="event" id={detail.id} label={c('Þessi hittingur', 'This event')} value={value.follows.event} onChanged={reload} />
    {detail.seriesId && value.follows.series && <FollowControl type="series" id={detail.seriesId} label={c('Hittingaröðin', 'This recurring series')} value={value.follows.series} onChanged={reload} />}
    {detail.host.id !== user?.id && <FollowControl type="host" id={detail.host.id} label={detail.host.displayName} value={value.follows.host} onChanged={reload} />}
  </View>;
}

export function ApplicationQuestions({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { theme } = useApp(); const c = useCopy();
  return <View style={{ gap: 10 }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{c('Spurningar til umsækjenda', 'Questions for applicants')}</Text>
    <Text style={{ color: theme.colors.textMuted }}>{c('Allt að tvær valfrjálsar spurningar. Aðeins þú sérð svörin.', 'Add up to two optional questions. Only you can see the answers.')}</Text>
    {[0, 1].map(index => <Field key={index} label={`${c('Spurning', 'Question')} ${index + 1}`} value={value[index] ?? ''} maxLength={200} onChangeText={text => onChange([0, 1].map(i => i === index ? text : value[i] ?? ''))} />)}
  </View>;
}

export function EventAdmission({ detail, value, reload }: { detail: MeetupDetail; value: CommunityState; reload: () => Promise<unknown> }) {
  const { theme, locale } = useApp(); const c = useCopy();
  const [introduction, setIntroduction] = useState(value.ownApplication?.introduction ?? '');
  const [answers, setAnswers] = useState<string[]>(value.ownApplication?.answers ?? []);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError(false);
    try { await operation(); await reload(); } catch { setError(true); await reload(); } finally { setBusy(false); }
  };
  const existing = value.ownApplication;
  const waitlist = value.waitlist;
  const accepted = ['joined', 'approved', 'host'].includes(detail.viewerState.participationStatus);
  const upcoming = Date.parse(detail.startsAt) > clock && detail.status === 'published';
  const canApply = value.canApply;
  const canWaitlist = value.canJoinWaitlist;
  const offerExpired = waitlist?.offerExpiresAt ? Date.parse(waitlist.offerExpiresAt) <= clock : false;
  if (accepted || (!upcoming && !existing && !waitlist)) return null;
  if (!canApply && !canWaitlist && !existing && !waitlist) return null;
  return <View style={{ gap: 12, padding: 16, borderRadius: 20, backgroundColor: theme.colors.surface }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{waitlist ? c('Biðlisti', 'Waitlist') : c('Umsókn um þátttöku', 'Apply to join')}</Text>
    {(waitlist || canWaitlist) && <Text style={{ color: theme.colors.textMuted }}>{c('Styrktaraðilar þessa hittings fá forgang á biðlista. Innan hvors hóps ræður skráningartími. Styrkur tryggir ekki aðgang og þegar útgefin tilboð haldast.', 'Sponsors of this event receive waitlist priority. Within each group, earlier entries come first. Sponsorship does not guarantee admission or displace existing offers.')}</Text>}
    {existing && <Text style={{ color: theme.colors.textMuted }}>{c('Staða umsóknar', 'Application status')}: {({ pending: c('Í bið', 'Pending'), approved: c('Samþykkt', 'Approved'), declined: c('Hafnað', 'Declined'), waitlisted: c('Á biðlista', 'Waitlisted'), offered: c('Pláss í boði', 'Place offered'), joined: c('Skráð', 'Joined') })[existing.status]}</Text>}
    {waitlist?.status === 'waiting' && <>
      <Text style={{ color: theme.colors.text }}>{c('Þú ert á biðlista. Þú færð tilkynningu þegar þér býðst pláss.', 'You are on the waitlist. We will notify you when a place is offered.')}{waitlist.position !== null ? ` ${c('Röð', 'Position')}: ${waitlist.position}` : ''}</Text>
      <Button disabled={busy} variant="secondary" label={c('Fara af biðlista', 'Leave waitlist')} onPress={() => void run(() => communityApi.waitlistAction(detail.id, 'leave'))} />
    </>}
    {waitlist?.status === 'offered' && <>
      <Text style={{ color: theme.colors.text }}>{offerExpired ? c('Tilboðið er útrunnið. Uppfærðu stöðuna.', 'This offer has expired. Refresh to see your status.') : c('Þér býðst pláss! Þú þarft að samþykkja til að skrá þig.', 'A place is available! Accept it to confirm your participation.')}</Text>
      {waitlist.offerExpiresAt && <Text style={{ color: theme.colors.textMuted }}>{c('Rennur út', 'Expires')}: {formatHittingurDate(waitlist.offerExpiresAt, locale)}</Text>}
      {offerExpired ? <Button disabled={busy} label={c('Uppfæra', 'Refresh')} onPress={() => void run(reload)} /> : <>
        <Button loading={busy} label={c('Samþykkja pláss', 'Accept place')} onPress={() => void run(() => communityApi.waitlistAction(detail.id, 'accept'))} />
        <Button disabled={busy} variant="secondary" label={c('Hafna plássi', 'Decline place')} onPress={() => void run(() => communityApi.waitlistAction(detail.id, 'decline'))} />
      </>}
    </>}
    {!waitlist && canApply && (!existing || ['declined', 'pending'].includes(existing.status)) && <>
      <Text style={{ color: theme.colors.textMuted }}>{c('Umsóknin þín og ákvörðun gestgjafans eru einkamál.', 'Your application and the host’s decision stay private.')}</Text>
      <Field label={c('Segðu aðeins frá þér', 'A short introduction')} value={introduction} onChangeText={setIntroduction} multiline maxLength={1000} />
      {value.applicationQuestions.map((question, index) => <Field key={index} label={`${question} (${c('valfrjálst', 'optional')})`} value={answers[index] ?? ''} maxLength={1000} multiline onChangeText={text => setAnswers(value.applicationQuestions.map((_, i) => i === index ? text : answers[i] ?? ''))} />)}
      {!!detail.eventProfile?.rules && <Text style={{ color: theme.colors.text }}>{detail.eventProfile.rules}</Text>}
      <ChoiceChip label={c('Ég hef lesið og samþykki reglur hittingsins', 'I have read and accept the event rules')} selected={rulesAccepted} onPress={() => { if (!busy) setRulesAccepted(!rulesAccepted); }} />
      <Button loading={busy} disabled={!rulesAccepted || introduction.trim().length < 1} label={c('Senda umsókn', 'Send application')} onPress={() => void run(() => communityApi.apply(detail.id, { introduction: introduction.trim(), answers: value.applicationQuestions.map((_, i) => answers[i]?.trim() ?? ''), rulesAccepted: true }))} />
    </>}
    {!waitlist && canWaitlist && !canApply && <>
      <Text style={{ color: theme.colors.textMuted }}>{c('Fullbókað. Skráðu þig á biðlista og samþykktu tilboð þegar pláss losnar.', 'This event is full. Join the waitlist and accept an offer when a place opens.')}</Text>
      <Button loading={busy} label={c('Skrá mig á biðlista', 'Join waitlist')} onPress={() => void run(() => communityApi.waitlistAction(detail.id, 'join'))} />
    </>}
    {error && <CommunityError />}
  </View>;
}

export function ApplicationInbox({ id, onChanged }: { id: string; onChanged: () => Promise<unknown> }) {
  const { theme, locale } = useApp(); const c = useCopy();
  const [items, setItems] = useState<CommunityApplication[]>([]); const [questions, setQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const load = useCallback(async () => { const [rows, state] = await Promise.all([communityApi.listApplications(id), communityApi.getState(id)]); setItems(rows); setQuestions(state.applicationQuestions); }, [id]);
  useFocusEffect(useCallback(() => { let active = true; void Promise.all([communityApi.listApplications(id), communityApi.getState(id)]).then(([rows, state]) => { if (active) { setItems(rows); setQuestions(state.applicationQuestions); } }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [id]));
  const decide = async (profileId: string, approved: boolean) => {
    if (busy) return; setBusy(true); setError(false);
    try { await communityApi.decideApplication(id, profileId, approved); await load(); await onChanged(); } catch { setError(true); } finally { setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{c('Umsóknir', 'Applications')}</Text>
    <Text style={{ color: theme.colors.textMuted }}>{c('Aðeins gestgjafi sér umsóknir og þátttakendur. Samþykktir umsækjendur fara á biðlista ef fullbókað er.', 'Only the host sees applications and participants. Approved applicants join the waitlist when the event is full.')}</Text>
    {items.length === 0 && <Text style={{ color: theme.colors.textMuted }}>{c('Engar umsóknir enn.', 'No applications yet.')}</Text>}
    {items.map(item => <View key={item.profileId} style={{ padding: 16, gap: 10, borderRadius: 18, backgroundColor: theme.colors.surface }}>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.displayName}</Text>
      <Text style={{ color: theme.colors.textMuted }}>{new Date(item.createdAt).toLocaleDateString(locale)} · {({ pending: c('Í bið', 'Pending'), approved: c('Samþykkt', 'Approved'), declined: c('Hafnað', 'Declined'), waitlisted: c('Á biðlista', 'Waitlisted'), offered: c('Pláss í boði', 'Place offered'), joined: c('Skráð', 'Joined') })[item.status]}</Text>
      <Text style={{ color: theme.colors.text }}>{item.introduction}</Text>
      {item.answers.map((answer, index) => !!answer && <View key={index} style={{ gap: 4 }}><Text style={{ color: theme.colors.textMuted }}>{questions[index] ?? `${c('Spurning', 'Question')} ${index + 1}`}</Text><Text style={{ color: theme.colors.text }}>{answer}</Text></View>)}
      <Text style={{ color: theme.colors.textMuted }}>{item.rulesAccepted ? c('Reglur samþykktar', 'Rules accepted') : c('Reglur ekki samþykktar', 'Rules not accepted')}</Text>
      {item.status === 'pending' && <View style={{ gap: 8 }}>
        <Button disabled={busy} label={c('Samþykkja', 'Approve')} onPress={() => void decide(item.profileId, true)} />
        <Button disabled={busy} variant="secondary" label={c('Hafna', 'Decline')} onPress={() => void decide(item.profileId, false)} />
      </View>}
    </View>)}
    {error && <><CommunityError /><Button disabled={busy} variant="secondary" label={c('Reyna aftur', 'Retry')} onPress={() => { setError(false); void load().catch(() => setError(true)); }} /></>}
  </View>;
}

export function EventAnnouncements({ id, editable = false }: { id: string; editable?: boolean }) {
  const { theme, locale } = useApp(); const c = useCopy();
  const [items, setItems] = useState<CommunityAnnouncement[]>([]); const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'followers' | 'participants'>('participants');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const load = useCallback(async () => { setItems(await communityApi.listAnnouncements(id)); }, [id]);
  useFocusEffect(useCallback(() => { let active = true; void communityApi.listAnnouncements(id).then(rows => { if (active) setItems(rows); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [id]));
  const send = async () => {
    if (busy) return; setBusy(true); setError(false);
    try { await communityApi.publishAnnouncement(id, audience, body.trim()); setBody(''); await load(); } catch { setError(true); } finally { setBusy(false); }
  };
  if (!editable && !items.length && !error) return null;
  return <View style={{ gap: 12 }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{c('Tilkynningar gestgjafa', 'Host announcements')}</Text>
    {editable && <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ChoiceChip label={c('Aðeins samþykktir þátttakendur', 'Accepted participants only')} selected={audience === 'participants'} onPress={() => setAudience('participants')} />
        <ChoiceChip label={c('Fylgjendur og þátttakendur', 'Followers and participants')} selected={audience === 'followers'} onPress={() => setAudience('followers')} />
      </View>
      <Text style={{ color: theme.colors.textMuted }}>{audience === 'participants' ? c('Upplýsingar um komu og aðgang eiga heima hér.', 'Use participant-only announcements for arrival details and access information.') : c('Sýnilegt fylgjendum. Ekki setja inn einkanetföng, heimilisföng eða aðgangskóða.', 'Visible to followers. Keep private addresses and access codes out of this announcement.')}</Text>
      <Field label={c('Skilaboð', 'Message')} value={body} onChangeText={setBody} multiline maxLength={4000} />
      <Button loading={busy} disabled={!body.trim()} label={c('Senda tilkynningu', 'Send announcement')} onPress={() => void send()} />
    </>}
    {items.map(item => <View key={item.id} style={{ padding: 14, gap: 7, borderRadius: 18, backgroundColor: theme.colors.surface }}>
      <Text style={{ color: theme.colors.textMuted }}>{new Date(item.createdAt).toLocaleString(locale)} · {item.audience === 'participants' ? c('Aðeins þátttakendur', 'Participants only') : c('Fylgjendur og þátttakendur', 'Followers and participants')}</Text>
      <Text style={{ color: theme.colors.text, lineHeight: 22 }}>{item.body}</Text>
    </View>)}
    {error && <><CommunityError /><Button label={c('Reyna aftur', 'Retry')} variant="secondary" onPress={() => { setError(false); void load().catch(() => setError(true)); }} /></>}
  </View>;
}

export function ReputationSummary({ value }: { value: CommunityHostSummary['reputation'] }) {
  const { theme } = useApp(); const c = useCopy();
  return <View style={{ gap: 5 }}>
    <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{c('Mæla með', 'Recommend')}: {value.positive} · {c('Mæla ekki með', 'Do not recommend')}: {value.negative}</Text>
    <Text style={{ color: theme.colors.textMuted }}>{value.total} {c('umsagnir frá þátttakendum', 'attendee recommendations')}</Text>
    {value.legacyCount > 0 && <Text style={{ color: theme.colors.textMuted }}>{c('Eldri stjörnugjöf', 'Historical star ratings')}: {value.legacyAverage?.toFixed(1) ?? '—'} ★ · {value.legacyCount}</Text>}
  </View>;
}

export function HostCommunity({ hostId, showTitle = true }: { hostId: string; showTitle?: boolean }) {
  const { theme, locale, user } = useApp(); const c = useCopy(); const router = useRouter();
  const [summary, setSummary] = useState<CommunityHostSummary | null>(null); const [error, setError] = useState(false);
  const revision = useRef(0);
  const load = useCallback(async () => { const ticket = ++revision.current; const value = await communityApi.getHostSummary(hostId); if (ticket === revision.current) { setSummary(value); setError(false); } }, [hostId]);
  useFocusEffect(useCallback(() => { setSummary(null); void load().catch(() => setError(true)); return () => { revision.current++; }; }, [load, user?.id]));
  if (!summary) return <View style={{ gap: 10 }}>{error ? <><CommunityError /><Button label={c('Reyna aftur', 'Retry')} onPress={() => void load().catch(() => setError(true))} /></> : <Text style={{ color: theme.colors.textMuted }}>{c('Sæki upplýsingar gestgjafa…', 'Loading host information…')}</Text>}</View>;
  return <View style={{ gap: 16 }}>
    {showTitle && <Text style={[textStyles.heading, { color: theme.colors.text }]}>{summary.displayName} · {c('Gestgjafi', 'Host')}</Text>}
    {!summary.profileVisible && <Text style={{ color: theme.colors.textMuted }}>{c('Persónulegi prófíllinn er falinn. Hér sjást aðeins opinberir hittingar og reynsla þátttakenda.', 'The personal profile is hidden. This page shows public hosted gatherings and attendee feedback.')}</Text>}
    <Text style={{ color: theme.colors.textMuted }}>{summary.followerCount} {c('fylgjendur', 'followers')}</Text>
    {hostId !== user?.id && <FollowControl type="host" id={hostId} label={summary.displayName} value={{ count: summary.followerCount, following: summary.following, notifications: summary.notifications }} onChanged={load} />}
    <ReputationSummary value={summary.reputation} />
    {summary.profileVisible && showTitle && <Button variant="ghost" label={c('Skoða prófíl', 'View profile')} onPress={() => router.push(`/profile/${hostId}` as Href)} />}
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{c('Næstu hittingar gestgjafa', 'Upcoming hosted gatherings')}</Text>
    {summary.upcomingGatherings.length === 0 && <Text style={{ color: theme.colors.textMuted }}>{c('Engir hittingar framundan.', 'No upcoming gatherings.')}</Text>}
    {summary.upcomingGatherings.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/hittingar/${item.id}` as Href)} style={{ padding: 14, gap: 8, backgroundColor: theme.colors.surface, borderRadius: 18 }}>
      <EventCover cover={item.cover} title={item.title} compact />
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.title}</Text><Text style={{ color: theme.colors.textMuted }}>{formatHittingurDate(item.startsAt, locale)}</Text>
    </Pressable>)}
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{c('Fyrri hittingar', 'Past gatherings')}</Text>
    {summary.pastGatherings.length === 0 && <Text style={{ color: theme.colors.textMuted }}>{c('Engir fyrri hittingar.', 'No past gatherings yet.')}</Text>}
    {summary.pastGatherings.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/hittingar/${item.id}` as Href)} style={{ padding: 14, gap: 10, backgroundColor: theme.colors.surface, borderRadius: 18 }}>
      <EventCover cover={item.cover} title={item.title} compact />
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.title}</Text><Text style={{ color: theme.colors.textMuted }}>{formatHittingurDate(item.startsAt, locale)}</Text>
      <ReputationSummary value={item.feedback} />
    </Pressable>)}
  </View>;
}
