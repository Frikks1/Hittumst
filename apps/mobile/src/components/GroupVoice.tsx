import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
export type GroupVoiceProps={groupId:string;enabled:boolean};
/** Native RTC is available in the Android/iOS development and store builds. */
export default function GroupVoice(_props:GroupVoiceProps) {
  const {locale,theme}=useApp();
  return <Text style={{color:theme.colors.textMuted}}>{locale==='is'?'Raddspjall hópa er í boði í Android- og iOS-appinu.':'Group voice is available in the Android and iOS app.'}</Text>;
}
