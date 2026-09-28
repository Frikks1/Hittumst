import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { CommunityFeedback, MeetupDetail } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, Field, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { communityApi } from '@/services/community';
import { CommunityError, ReputationSummary } from './CommunityPanels';

export function EventReviews({ detail }: { detail: Pick<MeetupDetail, 'id'> & Partial<Pick<MeetupDetail, 'host' | 'effectiveEnd'>> }) {
  const { theme, user, locale } = useApp();
  const c = (is: string, en: string) => locale === 'is' ? is : en;
  const [feedback, setFeedback] = useState<CommunityFeedback | null>(null);
  const [body, setBody] = useState(''); const [recommended, setRecommended] = useState<boolean | null>(null);
  const [reason, setReason] = useState(''); const [requestOpen, setRequestOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = generation.current;
    const value = await communityApi.getFeedback(detail.id);
    if (ticket !== generation.current) return;
    setFeedback(value); setBody(value.ownReview?.body ?? ''); setRecommended(value.ownReview?.recommended ?? null);
  }, [detail.id]);
  useFocusEffect(useCallback(() => {
    generation.current++; setFeedback(null); setError(false); setReason(''); setRequestOpen(false);
    const ticket = generation.current;
    void load().catch(() => { if (ticket === generation.current) setError(true); });
    return () => { generation.current++; };
  }, [load, user?.id]));
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return; const ticket = generation.current; setBusy(true); setError(false);
    try { await operation(); if (ticket === generation.current) await load(); }
    catch { if (ticket === generation.current) setError(true); }
    finally { if (ticket === generation.current) setBusy(false); }
  };
  const ended = detail.effectiveEnd ? Date.parse(detail.effectiveEnd) < Date.now() : true;
  return <View style={{ gap: 14 }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{c('Reynsla þátttakenda', 'Attendee feedback')}</Text>
    <Text style={{ color: theme.colors.textMuted, lineHeight: 21 }}>{c('Aðeins þátttakendur með staðfesta mætingu geta gefið umsögn eftir hitting. Atkvæði eru einkamál. Skriflegar umsagnir eru birtar sem „Þátttakandi“.', 'Only attendees with recorded attendance can review after the event. Individual votes are private. Written reviews appear as “Attendee”.')}</Text>
    {feedback && <>
      <ReputationSummary value={feedback.summary} />
      {feedback.seriesSummary && <View style={{ gap: 6, padding: 14, backgroundColor: theme.colors.surface, borderRadius: 18 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{c('Reynsla af fyrri hittingum í röðinni', 'Historical feedback about this series')}</Text>
        <ReputationSummary value={feedback.seriesSummary} />
      </View>}
      {!feedback.reviews.length && <Text style={{ color: theme.colors.textMuted }}>{c('Engar skriflegar umsagnir enn.', 'No written reviews yet.')}</Text>}
      {feedback.reviews.map(review => <View key={review.id} style={{ gap: 8, padding: 16, borderRadius: 18, backgroundColor: theme.colors.surface }}>
        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{c('Þátttakandi', 'Attendee')} · {new Date(review.createdAt).toLocaleDateString(locale)}</Text>
        {review.legacyRating !== null && <Text style={{ color: theme.colors.textMuted }}>{c('Eldri stjörnugjöf', 'Historical star rating')}: {review.legacyRating} ★</Text>}
        <Text style={{ color: theme.colors.text, lineHeight: 22 }}>{review.body}</Text>
      </View>)}
      {feedback.canReview && <View style={{ gap: 12 }}>
        <Text style={[textStyles.heading, { color: theme.colors.text }]}>{c('Mælirðu með þessum hittingi?', 'Would you recommend this hittingur?')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ChoiceChip label={c('Já', 'Yes')} selected={recommended === true} onPress={() => { if (!busy) setRecommended(true); }} />
          <ChoiceChip label={c('Nei', 'No')} selected={recommended === false} onPress={() => { if (!busy) setRecommended(false); }} />
        </View>
        <Field label={c('Segðu frá reynslunni (valfrjálst)', 'Share your experience (optional)')} value={body} onChangeText={setBody} multiline maxLength={2000} />
        <Text style={{ color: theme.colors.textMuted }}>{c('Forðastu persónugreinanlegar upplýsingar. Aðrir gætu þekkt þig af því sem þú skrifar.', 'Avoid identifying details. Other people may recognize you from what you write.')}</Text>
        <Button label={c('Vista umsögn', 'Save recommendation')} loading={busy} disabled={recommended === null} onPress={() => { if (recommended !== null) void run(() => communityApi.recommend(detail.id, recommended, body.trim())); }} />
      </View>}
      {feedback.ownReview && <Button label={c('Eyða minni umsögn', 'Delete my recommendation')} disabled={busy} variant="ghost" onPress={() => void run(() => communityApi.deleteRecommendation(detail.id))} />}
      {!feedback.canReview && ended && detail.host?.id !== user?.id && <View style={{ gap: 10 }}>
        {feedback.attendanceReviewStatus === 'pending' ? <Text style={{ color: theme.colors.textMuted }}>{c('Beiðni um staðfestingu mætingar bíður yfirferðar.', 'Your missed check-in request is awaiting review.')}</Text> : feedback.attendanceReviewStatus === 'rejected' ? <Text style={{ color: theme.colors.textMuted }}>{c('Beiðni um staðfestingu mætingar var hafnað.', 'Your missed check-in request was declined.')}</Text> : <>
          <Button variant="secondary" label={c('Mætti en gleymdi innritun', 'Attended but missed check-in')} onPress={() => setRequestOpen(!requestOpen)} />
          {requestOpen && <>
            <Text style={{ color: theme.colors.textMuted }}>{c('Þjónustuteymið fer yfir beiðnina. Samþykki veitir rétt til umsagnar; það breytir ekki greiðslum.', 'The moderation team will review your request. Approval enables a review and does not change payments.')}</Text>
            <Field label={c('Lýstu mætingunni (að minnsta kosti 20 stafir)', 'Describe your attendance (at least 20 characters)')} value={reason} onChangeText={setReason} multiline maxLength={2000} />
            <Button label={c('Óska eftir yfirferð', 'Request review')} loading={busy} disabled={reason.trim().length < 20} onPress={() => void run(() => communityApi.requestAttendanceReview(detail.id, reason.trim()))} />
          </>}
        </>}
      </View>}
    </>}
    {error && <><CommunityError /><Button label={c('Reyna aftur', 'Retry')} variant="secondary" onPress={() => void run(async () => undefined)} /></>}
  </View>;
}
