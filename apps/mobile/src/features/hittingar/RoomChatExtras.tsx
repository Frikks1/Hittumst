import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { Button } from '@/components/ui';
import { meetupRoomChatCopy } from '@/i18n/meetupRoomChat';
import { useApp } from '@/providers/AppProvider';
import type { MeetupRoomMessage } from '@/types/domain';

export const ROOM_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;
export type RoomReactionEmoji = typeof ROOM_REACTIONS[number];
export type RoomQuote = { id: string; unavailable: boolean; senderName?: string; body?: string; kind?: MeetupRoomMessage['kind'] };

export function RoomQuotedMessage({ quote, onClear, disabled = false }: { quote: RoomQuote; onClear?: () => void; disabled?: boolean }) {
  const { theme, locale } = useApp(); const copy = meetupRoomChatCopy(locale);
  const preview = quote.unavailable ? copy.replyUnavailable : quote.body || (quote.kind === 'video' ? copy.video : quote.kind === 'photo' ? copy.photo : quote.kind === 'poll' ? copy.poll : copy.quotedMessage);
  return <View style={[styles.quote, { backgroundColor: theme.colors.surfaceRaised, borderLeftColor: theme.colors.accent }]}>
    <View style={{ flex: 1, gap: 3 }}>{!quote.unavailable && <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '800' }}>{onClear ? `${copy.replyTo} ${quote.senderName ?? ''}` : quote.senderName ?? copy.quotedMessage}</Text>}<Text numberOfLines={2} style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 }}>{preview}</Text></View>
    {onClear && <Pressable accessibilityRole="button" accessibilityLabel={copy.clearReply} disabled={disabled} accessibilityState={{ disabled }} onPress={onClear} style={styles.clear}><Ionicons name="close" size={20} color={theme.colors.textMuted} /></Pressable>}
  </View>;
}

export function RoomReactions({ reactions = [], expanded, disabled, onToggle, onSelect }: {
  reactions?: MeetupRoomMessage['reactions']; expanded: boolean; disabled: boolean; onToggle: () => void; onSelect: (emoji: RoomReactionEmoji | null) => void;
}) {
  const { theme, locale } = useApp(); const copy = meetupRoomChatCopy(locale);
  return <View style={{ gap: 6 }}>
    <View style={styles.reactions}>{reactions.filter(reaction => reaction.count > 0).map(reaction => <Pressable key={reaction.emoji} accessibilityRole="button" accessibilityLabel={copy.reactionLabel(reaction.emoji, reaction.count)} accessibilityState={{ selected: reaction.reacted, disabled }} disabled={disabled} onPress={() => onSelect(reaction.reacted ? null : reaction.emoji as RoomReactionEmoji)} style={[styles.reaction, { borderColor: reaction.reacted ? theme.colors.accent : theme.colors.border, backgroundColor: reaction.reacted ? theme.colors.accentSoft : theme.colors.surfaceRaised }]}><Text>{reaction.emoji}</Text><Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '800' }}>{reaction.count}</Text></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel={copy.reactions} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onToggle} style={[styles.reaction, { borderColor: theme.colors.border }]}><Ionicons name="happy-outline" size={18} color={theme.colors.textMuted} /></Pressable>
    </View>
    {expanded && <View style={styles.reactions}>{ROOM_REACTIONS.map(emoji => { const selected = reactions.some(reaction => reaction.emoji === emoji && reaction.reacted); return <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={copy.reactionLabel(emoji, reactions.find(reaction => reaction.emoji === emoji)?.count ?? 0)} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onSelect(selected ? null : emoji)} style={[styles.emojiChoice, { borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface }]}><Text style={{ fontSize: 20 }}>{emoji}</Text></Pressable>; })}</View>}
  </View>;
}

export function RoomPoll({ poll, disabled, onVote, onClose }: { poll: NonNullable<MeetupRoomMessage['poll']>; disabled: boolean; onVote: (optionId: string) => void; onClose: () => void }) {
  const { theme, locale } = useApp(); const copy = meetupRoomChatCopy(locale);
  return <View style={styles.poll}>
    <View style={styles.inline}><Ionicons name="bar-chart-outline" size={18} color={theme.colors.accent} /><Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '800' }}>{copy.poll}</Text></View>
    <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>{poll.question}</Text>
    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{poll.closed ? copy.pollClosed : copy.pollHint}</Text>
    {poll.options.map(option => { const selected = poll.votedOptionId === option.id; const percent = poll.totalVotes ? Math.round(option.voteCount / poll.totalVotes * 100) : 0; return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${option.text}, ${copy.pollVotes(option.voteCount)}, ${percent}%`} accessibilityState={{ checked: selected, disabled: disabled || poll.closed }} disabled={disabled || poll.closed} onPress={() => onVote(option.id)} style={[styles.pollOption, { borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surfaceRaised }]}>
      <View style={styles.inline}><Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={19} color={selected ? theme.colors.accent : theme.colors.textMuted} /><Text style={{ color: theme.colors.text, flex: 1, fontWeight: selected ? '800' : '500' }}>{option.text}</Text><Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{option.voteCount} · {percent}%</Text></View>
      <View style={[styles.pollTrack, { backgroundColor: theme.colors.border }]}><View style={{ height: 3, width: `${percent}%`, backgroundColor: theme.colors.accent }} /></View>
    </Pressable>; })}
    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{copy.pollVotes(poll.totalVotes)}</Text>
    {poll.canClose && !poll.closed && <Button variant="ghost" label={copy.closePoll} disabled={disabled} onPress={onClose} />}
  </View>;
}

export function RoomPollComposer({ question, options, busy, error, onQuestionChange, onOptionsChange, onPublish, onCancel }: {
  question: string; options: string[]; busy: boolean; error: boolean; onQuestionChange: (value: string) => void; onOptionsChange: (options: string[]) => void; onPublish: () => void; onCancel: () => void;
}) {
  const { theme, locale } = useApp(); const copy = meetupRoomChatCopy(locale);
  return <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={[styles.pollComposer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} contentContainerStyle={styles.pollComposerContent}>
    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{copy.createPoll}</Text>
    <TextInput accessibilityLabel={copy.pollQuestion} maxLength={200} editable={!busy} value={question} onChangeText={onQuestionChange} placeholder={copy.pollQuestion} placeholderTextColor={theme.colors.textMuted} style={[styles.pollInput, { color: theme.colors.text, borderColor: theme.colors.border }]} />
    {options.map((option, index) => <View key={index} style={styles.inline}><TextInput accessibilityLabel={copy.pollChoice(index + 1)} maxLength={100} editable={!busy} value={option} onChangeText={value => onOptionsChange(options.map((current, currentIndex) => currentIndex === index ? value : current))} placeholder={copy.pollChoice(index + 1)} placeholderTextColor={theme.colors.textMuted} style={[styles.pollInput, { color: theme.colors.text, borderColor: theme.colors.border, flex: 1 }]} />{options.length > 2 && <Pressable accessibilityRole="button" accessibilityLabel={copy.removePollChoice(index + 1)} disabled={busy} onPress={() => onOptionsChange(options.filter((_, currentIndex) => currentIndex !== index))} style={styles.clear}><Ionicons name="close" size={20} color={theme.colors.textMuted} /></Pressable>}</View>)}
    {options.length < 6 && <Button variant="ghost" icon="add-outline" label={copy.addPollChoice} disabled={busy} onPress={() => onOptionsChange([...options, ''])} />}
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{copy.pollInvalid}</Text>}
    <View style={[styles.inline, { flexWrap: 'wrap' }]}><Button variant="secondary" label={copy.cancelPoll} disabled={busy} onPress={onCancel} /><Button icon="send" label={copy.publishPoll} loading={busy} onPress={onPublish} /></View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  quote: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, borderRadius: 8, padding: 10 },
  clear: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reactions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, reaction: { minWidth: 42, minHeight: 36, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 9 },
  emojiChoice: { width: 44, minHeight: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  poll: { gap: 8 }, pollOption: { padding: 10, gap: 8, borderWidth: 1, borderRadius: 10, minHeight: 48 }, pollTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  pollComposer: { maxHeight: 300, borderWidth: 1, borderRadius: 12 }, pollComposerContent: { padding: 12, gap: 8 }, pollInput: { minHeight: 44, borderWidth: 1, borderRadius: 8, padding: 10 },
});
