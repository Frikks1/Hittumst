import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, ChoiceChip, Field, Screen } from '@/components/ui';
import { Text } from '@/components/Typography';
import SharedMedia from '@/components/SharedMedia';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { runtimeEnv } from '@/services/env';
import { sendCameraMedia, type CameraRecipient } from '@/services/trains';

export default function CameraSendScreen() {
  const { user } = useApp();
  const { groupId, profileId, cover } = useLocalSearchParams<{ groupId?: string; profileId?: string; cover?: string }>();
  return <CameraSendContent key={`${user?.id}:${groupId}:${profileId}:${cover}`} groupId={groupId} profileId={profileId} cover={cover === '1'} />;
}

function CameraSendContent({ groupId, profileId, cover }: { groupId?: string; profileId?: string; cover: boolean }) {
  const { locale, theme } = useApp(); const is = locale === 'is';
  const scope = useRef(0);
  const pending = useRef(false);
  useEffect(() => { scope.current++; return () => { scope.current++; }; }, []);
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [recipients, setRecipients] = useState<CameraRecipient[]>([]);
  const [selected, setSelected] = useState<string[]>(groupId ? [`group:${groupId}`] : profileId ? [`person:${profileId}`] : []);
  const [sent, setSent] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [query, setQuery] = useState('');
  useEffect(() => { let active = true;
    void Promise.all([api.listGroups(), api.listFriends(), api.listConversations()]).then(async ([groups, friends, chats]) => {
      const people = new Map<string, CameraRecipient>();
      for (const friend of friends.filter(f => f.status === 'accepted')) people.set(friend.profileId, { id: friend.profileId, name: friend.displayName, type: 'person' });
      let page = chats;
      const cursors = new Set<string>();
      while (active) {
        for (const chat of page.items) people.set(chat.member.id, { id: chat.member.id, name: chat.member.displayName, type: 'person' });
        if (!page.nextCursor || cursors.has(page.nextCursor)) break;
        cursors.add(page.nextCursor);
        page = await api.listConversations(page.nextCursor);
      }
      if (!active) return;
      if (profileId && !people.has(profileId)) { const p = await api.getProfile(profileId); people.set(p.id, { id: p.id, name: p.displayName, type: 'person' }); }
      if (active) setRecipients([...groups.filter(g => g.membershipStatus !== 'invited' && g.status !== 'locked').map(g => ({ id: g.id, name: g.name, type: 'group' as const })), ...people.values()].filter(r => !cover || r.type === 'group' && r.id === groupId));
    }).catch(() => { if (active) setNotice(is ? 'Ekki tókst að sækja viðtakendur.' : 'Could not load recipients.'); });
    return () => { active = false; };
  }, [profileId, groupId, cover, is]);
  const capture = async (video: boolean, library = false) => {
    if (pending.current) return;
    const generation = scope.current;
    pending.current = true; setBusy(true);
    setNotice('');
    try {
      if (!library) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (generation !== scope.current) return;
        if (!permission.granted) { setNotice(is ? 'Leyfðu aðgang að myndavél til að taka mynd.' : 'Allow camera access to capture media.'); return; }
      }
      const result = library
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1, allowsEditing: false })
        : await ImagePicker.launchCameraAsync({ mediaTypes: video ? ['videos'] : ['images'], videoMaxDuration: 60, quality: 1 });
      if (generation !== scope.current || result.canceled || !result.assets[0]) return;
      if (result.assets[0].duration && result.assets[0].duration > 60000) { setNotice(is ? 'Veldu myndskeið sem er 60 sekúndur eða styttra.' : 'Choose a video of 60 seconds or less.'); return; }
      setAsset(result.assets[0]); setSent([]);
    } catch { if (generation === scope.current) setNotice(is ? 'Ekki tókst að opna myndavél eða myndasafn.' : 'Could not open the camera or library.'); }
    finally { if (generation === scope.current) { pending.current = false; setBusy(false); } }
  };
  const deliveries = recipients.filter(r => selected.includes(`${r.type}:${r.id}`) && !sent.includes(`${r.type}:${r.id}`));
  const send = async () => {
    if (!asset || pending.current || !deliveries.length || runtimeEnv.isDemo) return;
    const generation = scope.current;
    pending.current = true;
    setBusy(true); setNotice(''); let failures = 0; let successes = sent.length;
    // Retrying a partially completed multi-send skips acknowledged deliveries.
    for (const recipient of deliveries) {
      if (generation !== scope.current) return;
      try {
        await sendCameraMedia(recipient, asset, cover, () => generation === scope.current);
        if (generation !== scope.current) return;
        setSent(current => [...current, `${recipient.type}:${recipient.id}`]); successes++;
      }
      catch { failures++; }
    }
    if (generation !== scope.current) return;
    pending.current = false; setBusy(false);
    setNotice(failures ? (is ? `${successes} sent, ${failures} mistókust. Reyndu aftur til að senda aðeins þau sem mistókust.` : `${successes} sent, ${failures} failed. Retry sends only failed deliveries.`)
      : (is ? `Sent til ${successes}. Miðlar birtast eftir öryggisyfirferð.` : `Sent to ${successes}. Media appears after safety review.`));
  };
  return <Screen back title={is ? 'Mynda og senda' : 'Capture and send'}><View style={{ padding: 18, gap: 14 }}>
    <Button disabled={busy} icon="camera-outline" label={is ? 'Taka mynd' : 'Take photo'} onPress={() => void capture(false)} />
    <Button disabled={busy} variant="secondary" icon="videocam-outline" label={is ? 'Taka myndskeið' : 'Record video'} onPress={() => void capture(true)} />
    <Button disabled={busy} variant="secondary" icon="images-outline" label={is ? 'Myndasafn / GIF' : 'Library / GIF'} onPress={() => void capture(false, true)} />
    {asset && <SharedMedia uri={asset.uri} kind={asset.type === 'video' ? 'video' : 'image'} />}
    <Field label={is ? 'Leita að viðtakendum' : 'Find recipients'} value={query} onChangeText={setQuery} />
    <Text style={{ color: theme.colors.textMuted }}>{is ? 'Veldu einn eða fleiri viðtakendur.' : 'Choose one or more recipients.'}</Text>
    {recipients.filter(r => r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(r => { const key = `${r.type}:${r.id}`; return <ChoiceChip key={key} label={`${r.type === 'group' ? '👥' : '👤'} ${r.name}${sent.includes(key) ? ' ✓' : ''}`} selected={selected.includes(key)} onPress={() => { if (!pending.current) setSelected(current => current.includes(key) ? current.filter(x => x !== key) : [...current, key]); }} />; })}
    {runtimeEnv.isDemo && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Miðladeiling er ekki í boði í sýniham. Tengdur bakendi þarf að vera tiltækur til að senda.' : 'Media sharing is unavailable in demo mode. Sending requires a connected backend.'}</Text>}
    <Button icon="send" loading={busy} disabled={!asset || !deliveries.length || runtimeEnv.isDemo} label={is ? `Senda (${deliveries.length})` : `Send (${deliveries.length})`} onPress={() => void send()} />
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>{notice}</Text>}
  </View></Screen>;
}
