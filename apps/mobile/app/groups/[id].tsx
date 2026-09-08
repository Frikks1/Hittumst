import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Screen, TrustBanner } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { GroupMessage } from '@/types/domain';

export default function GroupScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { t, theme } = useApp();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [body, setBody] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  useEffect(() => { if (id) void api.listGroupMessages(id).then(setMessages); }, [id]);
  const send = async () => { if (!id || !body.trim()) return; const message = await api.sendGroupMessage(id, body); setMessages((current) => [...current, message]); setBody(''); };
  const voice = async () => { if (!id) return; await api.startGroupVoice(id); setVoiceActive(true); };
  return <Screen back title={name ?? t('social.group')}>
    <View style={styles.page}>
      <TrustBanner icon="shield-checkmark-outline" title={t('social.permanentGroup')} body={t('social.groupSafety')} />
      {id && <Button variant="secondary" icon="star-outline" label={t('social.star')} onPress={() => void api.toggleStarredItem('group', id, name ?? t('social.group'))} />}
      <Button variant="secondary" icon={voiceActive ? 'mic' : 'mic-outline'} label={voiceActive ? t('social.voiceActive') : t('social.startVoice')} onPress={() => void voice()} />
      <View style={styles.messages}>{messages.map((item) => <View key={item.id} style={[styles.message, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.sender, { color: theme.colors.text }]}>{item.senderName}</Text><Text style={{ color: theme.colors.text }}>{item.body}</Text></View>)}</View>
      <View style={styles.composer}><TextInput value={body} onChangeText={setBody} placeholder={t('social.messagePlaceholder')} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} /><Button icon="send" label={t('common.send')} disabled={!body.trim()} onPress={() => void send()} /></View>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({ page: { padding: 18, gap: 14 }, messages: { gap: 8 }, message: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 12, gap: 4 }, sender: { fontWeight: '900' }, composer: { gap: 8 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 } });
