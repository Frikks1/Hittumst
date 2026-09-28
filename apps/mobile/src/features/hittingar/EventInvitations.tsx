import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { FriendSummary } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';

export function EventInvitations({ id }: { id: string }) {
  const { t, theme } = useApp();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([api.listFriends(), api.listMeetupInvitations(id)]).then(([people, ids]) => {
      if (active) { setFriends(people.filter(person => person.status === 'accepted')); setInvited(ids); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [id]));
  const toggle = async (profileId: string) => {
    setBusy(true); setError(false);
    try { await api.setMeetupInvitation(id, profileId, !invited.includes(profileId)); setInvited(await api.listMeetupInvitations(id)); }
    catch { setError(true); } finally { setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('event.invitations')}</Text>
    <Text style={{ color: theme.colors.textMuted, lineHeight: 21 }}>{t('event.inviteHint')}</Text>
    {!friends.length && <Text style={{ color: theme.colors.textMuted }}>{t('event.noFriends')}</Text>}
    {friends.map(friend => <View key={friend.profileId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ flex: 1, color: theme.colors.text }}>{friend.displayName}{invited.includes(friend.profileId) ? ` · ${t('event.invited')}` : ''}</Text>
      <Button label={t(invited.includes(friend.profileId) ? 'event.remove' : 'event.invite')} disabled={busy} variant="secondary" onPress={() => void toggle(friend.profileId)} />
    </View>)}
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('event.error')}</Text>}
  </View>;
}
