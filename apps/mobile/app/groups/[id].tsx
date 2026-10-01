import { Text, TextInput } from '@/components/Typography';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { AppState, StyleSheet, View } from 'react-native';
import { Button, Screen, TrustBanner } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { FriendSummary, GroupAction, GroupMember, GroupMessage, GroupSummary, Page } from '@/types/domain';
import { confirmAction } from '@/utils/confirmAction';
import { createRefreshCoordinator } from '@/utils/refreshCoordinator';
import GroupVoice from '@/components/GroupVoice';
import TrainPanel from '@/components/TrainPanel';
import GroupMedia from '@/components/GroupMedia';
type GroupSnapshot = { group: GroupSummary; members: GroupMember[]; friends: FriendSummary[]; messages: GroupMessage[]; cursor: string | null };

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, theme, locale, user } = useApp();
  const is = locale === 'is';
  const router = useRouter();
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');
  const pageDepth = useRef(1);
  const pending = useRef<{ id: string; body: string } | null>(null);
  const refreshCoordinator = useRef(createRefreshCoordinator<GroupSnapshot>());
  const focused = useRef(false);
  const generation = useRef(0);
  useEffect(() => { setBody(''); pending.current = null; setBusy(false); setNotice(''); }, [id, user?.id]);

  const load = useCallback(async (): Promise<void> => {
    if (!id || !focused.current) return;
    return refreshCoordinator.current.request({
      read: async () => {
        const groups = await api.listGroups();
        const current = groups.find(item => item.id === id);
        if (!current || current.membershipStatus === 'invited') throw new Error('active_group_membership_required');
        const [roster, friendList] = await Promise.all([api.listGroupMembers(id), api.listFriends()]);
        const history: GroupMessage[] = [];
        let next: string | null = null;
        // Refresh all visible history so moderation and blocks also remove older content.
        for (let page = 0; page < pageDepth.current; page++) {
          const result: Page<GroupMessage> = await api.listGroupMessagePage(id, next);
          history.unshift(...result.items); next = result.nextCursor;
          if (!next) break;
        }
        return { group: current, members: roster, friends: friendList, messages: history, cursor: next };
      },
      apply: snapshot => {
        setGroup(snapshot.group); setMembers(snapshot.members); setFriends(snapshot.friends);
        setMessages(snapshot.messages); setCursor(snapshot.cursor); setError(false);
      },
      reject: failure => {
        setError(true);
        if ((failure as { code?: string; message?: string }).code === '42501' || (failure as Error).message === 'active_group_membership_required') {
          setMessages([]); setMembers([]); setGroup(null);
        }
      },
      settled: () => setLoading(false),
    });
  }, [id]);
  useFocusEffect(useCallback(() => {
    focused.current = true; generation.current++; pageDepth.current = 1;
    setMessages([]); setMembers([]); setGroup(null); setLoading(true);
    void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 8000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { focused.current = false; generation.current++; refreshCoordinator.current.cancel(); clearInterval(timer); listener.remove(); };
  }, [load]));

  const act = async (action: GroupAction, input?: Record<string, string>) => {
    if (!id || busy) return;
    const revision = generation.current;
    setBusy(true); setError(false);
    try {
      await api.groupAction(id, action, input);
      if (revision !== generation.current) return;
      refreshCoordinator.current.invalidate();
      if (action === 'leave' || action === 'archive') router.replace('/groups' as never);
      else await load();
    } catch { if (revision === generation.current) setError(true); }
    finally { if (revision === generation.current) setBusy(false); }
  };
  const confirm = (label: string, action: GroupAction, input?: Record<string, string>) => confirmAction({
    title: label, message: is ? 'Þessi breyting verður vistuð fyrir hópinn.' : 'This change will be saved for the group.',
    cancelLabel: t('common.cancel'), confirmLabel: label, destructive: true,
    onConfirm: () => act(action, input),
  });
  const send = async () => {
    if (!id || !body.trim() || busy) return;
    const revision = generation.current;
    const text = body.trim();
    if (!pending.current || pending.current.body !== text) pending.current = { id: Crypto.randomUUID(), body: text };
    setBusy(true); setError(false);
    try {
      const message = await api.sendGroupMessage(id, text, pending.current.id);
      if (revision !== generation.current) return;
      refreshCoordinator.current.invalidate();
      setMessages(current => [...current.filter(item => item.id !== message.id), message]); setBody(''); pending.current = null;
    } catch { if (revision === generation.current) setError(true); }
    finally { if (revision === generation.current) setBusy(false); }
  };
  const invite = async (profileId: string) => {
    if (busy) return;
    const revision = generation.current; setBusy(true); setError(false);
    try { await api.inviteGroupMember(id, profileId); if (revision !== generation.current) return; refreshCoordinator.current.invalidate(); await load(); }
    catch { if (revision === generation.current) setError(true); } finally { if (revision === generation.current) setBusy(false); }
  };
  const admin = group?.role === 'owner' || group?.role === 'admin';
  const moderator = admin || group?.role === 'moderator';
  return <Screen back title={group?.name ?? t('social.group')}><View style={styles.page}>
    <TrustBanner icon="shield-checkmark-outline" title={t('social.permanentGroup')} body={t('social.groupSafety')} />
    {error && <View style={styles.messages}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('common.error')} · {t('errors.network')}</Text><Button variant="secondary" label={t('common.retry')} onPress={() => void load()} /></View>}
    {loading && <Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text>}
    {group && <>
      <Button variant="secondary" icon="star-outline" label={t('social.star')} disabled={busy} onPress={() => { void api.toggleStarredItem('group', id, group.name).then(starred => setNotice(starred ? (is ? 'Vistað í stjörnumerkt.' : 'Saved to starred.') : (is ? 'Fjarlægt úr stjörnumerktu.' : 'Removed from starred.'))).catch(() => setError(true)); }} />
      <TrainPanel groupId={id} members={members} />
      <GroupMedia groupId={id} admin={!!admin} />
      <GroupVoice key={`${id}:${user?.id}`} groupId={id} enabled={group.status === 'active'} />
      {notice ? <Text accessibilityRole="alert" style={{ color: theme.colors.textMuted }}>{notice}</Text> : null}
      {cursor && <Button variant="secondary" label={is ? 'Eldri skilaboð' : 'Older messages'} onPress={() => { if (!refreshCoordinator.current.isRunning()) { pageDepth.current++; void load(); } }} />}
      <View style={styles.messages}>{messages.map(item => <View key={item.id} style={[styles.message, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.sender, { color: theme.colors.text }]}>{item.senderName}</Text><Text style={{ color: theme.colors.text }}>{item.body}</Text>
        {moderator && <Button variant="ghost" label={is ? 'Fela skilaboð' : 'Hide message'} disabled={busy} onPress={() => confirm(is ? 'Fela skilaboð' : 'Hide message', 'hide_message', { messageId: item.id })} />}
        {item.senderId !== user?.id && item.senderId !== 'deleted' && <Button variant="ghost" label={is ? 'Tilkynna sendanda' : 'Report sender'} onPress={() => router.push(`/report/${item.senderId}` as never)} />}
      </View>)}</View>
      {group.status === 'locked' ? <Text style={{ color: theme.colors.textMuted }}>{is ? 'Hópurinn er læstur fyrir ný skilaboð.' : 'This group is locked for new messages.'}</Text> : <View style={styles.composer}>
        <TextInput accessibilityLabel={t('social.messagePlaceholder')} maxLength={2000} editable={!busy} multiline value={body} onChangeText={setBody} placeholder={t('social.messagePlaceholder')} placeholderTextColor={theme.colors.textMuted} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} />
        <Button icon="send" label={t('common.send')} loading={busy} disabled={!body.trim()} onPress={() => void send()} />
      </View>}
      <Text accessibilityRole="header" style={[styles.sender, { color: theme.colors.text }]}>{is ? 'Meðlimir' : 'Members'}</Text>
      {members.map(member => <View key={member.profileId} style={[styles.message, { borderColor: theme.colors.border }]}>
        <Text style={{ color: theme.colors.text }}>{member.displayName} · {member.role}{member.status === 'invited' ? (is ? ' · boðið' : ' · invited') : ''}</Text>
        {admin && member.profileId !== user?.id && member.role !== 'owner' && (group.role === 'owner' || member.role === 'member') && <Button variant="ghost" disabled={busy} label={is ? 'Fjarlægja' : 'Remove'} onPress={() => confirm(is ? 'Fjarlægja meðlim' : 'Remove member', 'remove_member', { profileId: member.profileId })} />}
        {group.role === 'owner' && member.profileId !== user?.id && member.status === 'active' && <Button variant="secondary" disabled={busy} label={member.role === 'member' ? (is ? 'Gera að stjórnanda' : 'Make admin') : (is ? 'Gera að meðlim' : 'Make member')} onPress={() => void act('set_role', { profileId: member.profileId, role: member.role === 'member' ? 'admin' : 'member' })} />}
      </View>)}
      {admin && group.status !== 'locked' && friends.filter(friend => friend.status === 'accepted' && !members.some(member => member.profileId === friend.profileId)).map(friend => <Button key={friend.profileId} disabled={busy} variant="secondary" icon="person-add-outline" label={`${is ? 'Bjóða' : 'Invite'} ${friend.displayName}`} onPress={() => void invite(friend.profileId)} />)}
      {admin && <Button variant="secondary" disabled={busy} label={group.status === 'locked' ? (is ? 'Opna hóp' : 'Unlock group') : (is ? 'Læsa hópi' : 'Lock group')} onPress={() => void act(group.status === 'locked' ? 'unlock' : 'lock')} />}
      <Button variant="danger" disabled={busy} label={group.role === 'owner' ? (is ? 'Loka hópi' : 'Archive group') : (is ? 'Yfirgefa hóp' : 'Leave group')} onPress={() => confirm(group.role === 'owner' ? (is ? 'Loka hópi' : 'Archive group') : (is ? 'Yfirgefa hóp' : 'Leave group'), group.role === 'owner' ? 'archive' : 'leave')} />
    </>}
  </View></Screen>;
}
const styles = StyleSheet.create({ page: { padding: 18, gap: 14 }, messages: { gap: 8 }, message: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 12, gap: 4 }, sender: { fontWeight: '900' }, composer: { gap: 8 }, input: { minHeight: 48, maxHeight: 160, borderWidth: 1, borderRadius: 14, padding: 12 } });


