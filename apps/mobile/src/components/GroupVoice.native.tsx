import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Camera } from 'expo-camera';
import { AudioSession, AndroidAudioTypePresets, registerGlobals } from '@livekit/react-native';
import { Room, RoomEvent } from 'livekit-client';
import { Text } from '@/components/Typography';
import { Button } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { heartbeatVoice, joinVoice, voiceRequest, type VoiceAdmission } from '@/services/voiceApi';
import { supabase } from '@/services/supabase';
import { VoiceCallController, type VoicePhase } from '@/utils/voiceCall';
import { confirmAction } from '@/utils/confirmAction';
import { resolveVoiceAudioRouting, type VoiceAudioRouting } from '@/utils/voiceAudioRouting';
import type { GroupVoiceProps } from './GroupVoice';

let registered=false;
function initializeVoice() { if(!registered){registerGlobals();registered=true;} }
type ParticipantView={identity:string;muted:boolean;speaking:boolean};
export default function GroupVoice({groupId,enabled}:GroupVoiceProps) {
  const {locale,theme,user}=useApp();const is=locale==='is';const router=useRouter();
  const [phase,setPhase]=useState<VoicePhase>('idle');
  const [admission,setAdmission]=useState<VoiceAdmission|null>(null);
  const [participants,setParticipants]=useState<ParticipantView[]>([]);
  const [muted,setMuted]=useState(true);
  const [notice,setNotice]=useState('');
  const [permissionsDenied,setPermissionsDenied]=useState(false);
  const [bluetoothDenied,setBluetoothDenied]=useState(false);
  const [pending,setPending]=useState(false);
  const focused=useRef(false);const mounted=useRef(true);const microphoneBusy=useRef(false);
  const roomRef=useRef<Room|null>(null);
  const audioRouting=useRef<VoiceAudioRouting>({bluetoothAllowed:false,preferredOutputList:['headset','earpiece','speaker']});
  const controller=useMemo(()=>new VoiceCallController({
    join:()=>joinVoice(groupId),heartbeat:id=>heartbeatVoice(groupId,id),leave:id=>voiceRequest(groupId,'leave',id),
    startAudio:async()=>{
      initializeVoice();
      await AudioSession.configureAudio({android:{audioTypeOptions:AndroidAudioTypePresets.communication,preferredOutputList:audioRouting.current.preferredOutputList},ios:{defaultOutput:'earpiece'}});
      await AudioSession.startAudioSession();
    },
    stopAudio:()=>AudioSession.stopAudioSession(),
    changed:(next,current,error)=>{
      if(!mounted.current)return;
      setPhase(next);setAdmission(current);
      if(next==='idle'){setParticipants([]);setMuted(true);}
      if(error)setNotice(error);
    },
    createTransport:(changed,disconnected)=>{
      const room=new Room({adaptiveStream:false,dynacast:false,publishDefaults:{stopMicTrackOnMute:true},audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      roomRef.current=room;
      const refresh=()=>{
        if(!mounted.current || roomRef.current!==room)return;
        setMuted(!room.localParticipant.isMicrophoneEnabled);
        setParticipants([room.localParticipant,...room.remoteParticipants.values()].map(p=>({identity:p.identity,muted:!p.isMicrophoneEnabled,speaking:p.isSpeaking})));
      };
      room.on(RoomEvent.ParticipantConnected,refresh).on(RoomEvent.ParticipantDisconnected,refresh)
        .on(RoomEvent.TrackMuted,refresh).on(RoomEvent.TrackUnmuted,refresh)
        .on(RoomEvent.LocalTrackPublished,refresh).on(RoomEvent.LocalTrackUnpublished,refresh)
        .on(RoomEvent.ActiveSpeakersChanged,refresh).on(RoomEvent.Reconnecting,()=>changed('reconnecting'))
        .on(RoomEvent.SignalReconnecting,()=>changed('reconnecting')).on(RoomEvent.Reconnected,()=>{refresh();changed('connected');})
        .on(RoomEvent.Disconnected,disconnected).on(RoomEvent.MediaDevicesError,()=>{if(mounted.current)setNotice('voice_microphone_failed');});
      return {
        connect:async grant=>{await room.connect(grant.url,grant.token,{autoSubscribe:true,websocketTimeout:10000,peerConnectionTimeout:10000});refresh();},
        disconnect:async()=>{
          room.removeAllListeners();
          room.localParticipant.audioTrackPublications.forEach(publication=>publication.track?.stop());
          if(roomRef.current===room)roomRef.current=null;
          await room.disconnect(true);
        },
        mute:async value=>{await room.localParticipant.setMicrophoneEnabled(!value);refresh();},
      };
    },
  }),[groupId,user?.id]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;void controller.leave();};},[controller]);
  useFocusEffect(useCallback(()=>{focused.current=true;return()=>{focused.current=false;void controller.leave();};},[controller]));
  useEffect(()=>{
    if(!enabled)void controller.leave('voice_access_lost');
    const subscription=AppState.addEventListener('change',state=>{if(state!=='active')void controller.leave('voice_interrupted');});
    const blur=Platform.OS==='android'?AppState.addEventListener('blur',()=>{void controller.leave('voice_interrupted');}):null;
    const auth=supabase?.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT' || session?.user.id!==user?.id)void controller.leave('voice_access_lost');});
    return()=>{subscription.remove();blur?.remove();auth?.data.subscription.unsubscribe();};
  },[controller,enabled,user?.id]);
  const join=async()=>{
    if(pending || !focused.current || !enabled)return;
    setPending(true);setNotice('');setPermissionsDenied(false);setBluetoothDenied(false);
    try {
      const permission=await Camera.requestMicrophonePermissionsAsync();
      if(!permission.granted){setPermissionsDenied(true);setNotice('voice_microphone_denied');return;}
      if(!focused.current || AppState.currentState!=='active')return;
      audioRouting.current=await resolveVoiceAudioRouting(Platform.OS,Platform.Version,()=>PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT));
      if(!mounted.current || !focused.current || AppState.currentState!=='active')return;
      setBluetoothDenied(!audioRouting.current.bluetoothAllowed);
      await controller.join();
    } catch {if(mounted.current)setNotice('voice_unavailable');}
    finally {if(mounted.current)setPending(false);}
  };
  const toggleMute=async()=>{
    if(microphoneBusy.current)return;
    microphoneBusy.current=true;setPending(true);
    try {await controller.setMuted(!muted);}
    catch {if(mounted.current)setNotice('voice_microphone_failed');}
    finally {microphoneBusy.current=false;if(mounted.current)setPending(false);}
  };
  const moderate=(action:'remove'|'end',targetId?:string)=>confirmAction({
    title:action==='end'?(is?'Ljúka raddspjalli':'End voice call'):(is?'Fjarlægja úr raddspjalli':'Remove from voice call'),
    message:action==='end'?(is?'Raddspjallinu lýkur fyrir alla.':'The call will end for everyone.'):(is?'Viðkomandi getur ekki gengið aftur í þetta raddspjall.':'This person cannot rejoin the current call.'),
    cancelLabel:is?'Hætta við':'Cancel',confirmLabel:is?'Staðfesta':'Confirm',destructive:true,
    onConfirm:async()=>{
      setPending(true);
      try {await voiceRequest(groupId,action,admission?.admissionId,targetId);if(action==='end')await controller.leave();else setNotice('voice_removal_requested');}
      catch {setNotice('voice_unavailable');}finally {if(mounted.current)setPending(false);}
    },
  });
  const noticeText=notice==='voice_microphone_denied'?(is?'Leyfðu aðgang að hljóðnema til að nota raddspjall.':'Allow microphone access to use voice chat.')
    :notice==='voice_microphone_failed'?(is?'Ekki tókst að opna hljóðnemann. Athugaðu heimildir og reyndu aftur.':'Microphone could not be opened. Check permissions and try again.')
    :notice==='voice_removal_requested'?(is?'Beðið hefur verið um að fjarlægja viðkomandi úr raddspjallinu.':'Removal from the call has been requested.')
    :notice==='voice_interrupted'?(is?'Raddspjalli lauk þegar appið var truflað. Þú getur tengst aftur.':'The call ended when the app was interrupted. You can join again.')
    :notice==='voice_access_denied'||notice==='voice_access_lost'?(is?'Aðgangur að raddspjallinu er ekki lengur til staðar.':'You no longer have access to this call.')
    :notice==='voice_rate_limited'?(is?'Of margar tilraunir. Reyndu aftur síðar.':'Too many attempts. Try again later.')
    :notice?(is?'Raddspjall er ekki tiltækt núna. Reyndu aftur síðar.':'Voice is unavailable right now. Try again later.'):'';
  const busy=pending || phase==='joining' || phase==='leaving';
  return <View style={[styles.card,{borderColor:theme.colors.border}]}>
    <Text accessibilityRole="header" style={{color:theme.colors.text,fontWeight:'800'}}>{is?'Raddspjall hóps':'Group voice'}</Text>
    <Text style={{color:theme.colors.textMuted}}>{is?'Tengst með slökkt á hljóðnema. Raddspjalli lýkur þegar þú yfirgefur þennan skjá. Ekkert hljóð er tekið upp eða afritað.':'Join muted. The call ends when you leave this screen. Audio is not recorded or transcribed.'}</Text>
    {noticeText?<Text accessibilityRole="alert" style={{color:theme.colors.textMuted}}>{noticeText}</Text>:null}
    {bluetoothDenied&&<Text accessibilityRole="alert" style={{color:theme.colors.textMuted}}>{is?'Bluetooth-aðgangur er ekki leyfður. Raddspjall notar símann eða heyrnartól með snúru.':'Bluetooth access is unavailable. Voice will use the phone or a wired headset.'}</Text>}
    {(permissionsDenied||bluetoothDenied)&&<Button variant="secondary" label={is?'Opna stillingar':'Open settings'} onPress={()=>void Linking.openSettings()}/>}
    {phase==='idle'?<Button icon="mic-outline" variant="secondary" disabled={!enabled || busy} loading={pending} label={is?'Tengjast raddspjalli':'Join voice'} onPress={()=>void join()}/>:<>
      <Text accessibilityLiveRegion="polite" style={{color:theme.colors.text}}>{phase==='reconnecting'?(is?'Tengist aftur · hljóðnemi slökktur':'Reconnecting · microphone muted'):phase==='joining'?(is?'Tengist…':'Connecting…'):phase==='leaving'?(is?'Aftengist…':'Disconnecting…'):muted?(is?'Hljóðnemi slökktur':'Microphone muted'):(is?'Hljóðnemi virkur':'Microphone on')}</Text>
      <Button variant="secondary" icon={muted?'mic-outline':'mic-off-outline'} disabled={busy||phase!=='connected'} label={muted?(is?'Kveikja á hljóðnema':'Unmute microphone'):(is?'Slökkva á hljóðnema':'Mute microphone')} onPress={()=>void toggleMute()}/>
      <Button variant="danger" disabled={phase==='leaving'} label={is?'Yfirgefa raddspjall':'Leave voice'} onPress={()=>void controller.leave()}/>
      {participants.map(participant=>{
        const member=admission?.members.find(m=>m.identity===participant.identity);
        if(!member)return null;
        const canRemove=member.profileId!==user?.id && member.role!=='owner' && (admission?.role==='owner'||(['admin','moderator'].includes(admission?.role??'')&&member.role==='member'));
        return <View key={participant.identity} style={styles.member}>
          <Text style={{color:theme.colors.text}}>{member.name} · {participant.speaking?(is?'Talar':'Speaking'):participant.muted?(is?'Hljóðnemi slökktur':'Muted'):(is?'Hlustar':'Listening')}</Text>
          {member.profileId!==user?.id&&<Button variant="ghost" label={is?'Tilkynna':'Report'} onPress={()=>{void controller.leave();router.push(`/report/${member.profileId}` as never);}}/>}
          {canRemove&&<Button variant="ghost" disabled={busy} label={is?'Fjarlægja úr raddspjalli':'Remove from call'} onPress={()=>moderate('remove',member.profileId)}/>}
        </View>;
      })}
      {(admission?.role==='owner'||admission?.role==='admin')&&<Button variant="ghost" disabled={busy} label={is?'Ljúka raddspjalli fyrir alla':'End call for everyone'} onPress={()=>moderate('end')}/>}
    </>}
  </View>;
}
const styles=StyleSheet.create({card:{borderWidth:StyleSheet.hairlineWidth,borderRadius:14,padding:12,gap:10},member:{gap:4}});



