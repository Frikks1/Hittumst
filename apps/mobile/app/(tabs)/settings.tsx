import { type Href, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ChoiceChip, Screen, SettingRow, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';

export default function SettingsScreen() {
  const {locale,setLocale,themeMode,setThemeMode,t,theme,signOut,clearLocation,verifyLocation}=useApp();
  const [locationSharing,setLocationSharing]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  useFocusEffect(useCallback(()=>{let active=true;void api.getOwnProfile().then(profile=>{if(active)setLocationSharing(profile.locationSharing);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[]));
  const changeLocation=async(enabled:boolean)=>{
    if(busy)return;
    setBusy(true);setError(false);
    try{
      if(enabled&&(await verifyLocation())!=='verified'){setError(true);return;}
      await api.updateProfile({locationSharing:enabled});setLocationSharing(enabled);
      if(!enabled)clearLocation();
    }catch{setError(true);}
    finally{setBusy(false);}
  };
  return <Screen title={t('settings.title')}><View style={styles.page}>
    {error&&<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{t('privacy.actionFailed')}</Text>}
    <Text style={[textStyles.eyebrow,{color:theme.colors.textMuted}]}>{t('settings.preferences')}</Text>
    <View style={[styles.group,{backgroundColor:theme.colors.surface,borderColor:theme.colors.border}]}>
      <Text accessibilityRole="header" style={[styles.label,{color:theme.colors.text}]}>{t('settings.chooseLanguage')}</Text>
      <View style={styles.choices}><ChoiceChip label="Íslenska" selected={locale==='is'} onPress={()=>setLocale('is')} /><ChoiceChip label="English" selected={locale==='en'} onPress={()=>setLocale('en')} /></View>
      <Text accessibilityRole="header" style={[styles.label,{color:theme.colors.text}]}>{t('settings.chooseAppearance')}</Text>
      <View style={styles.choices}>{(['system','light','dark'] as const).map(mode=><ChoiceChip key={mode} label={t(`settings.${mode}`)} selected={themeMode===mode} onPress={()=>setThemeMode(mode)} />)}</View>
    </View>
    <Text style={[textStyles.eyebrow,styles.section,{color:theme.colors.textMuted}]}>{t('settings.privacy')}</Text>
    <View style={[styles.group,{backgroundColor:theme.colors.surface,borderColor:theme.colors.border}]}>
      <SettingRow icon="people-outline" title={t('social.friends')} href={'/friends' as Href} />
      <SettingRow icon="star-outline" title={t('social.starred')} href={'/starred' as Href} />
      <SettingRow icon="shield-checkmark-outline" title={t('settings.privacy')} href="/privacy" />
      <SettingRow icon="ban-outline" title={t('settings.blocked')} href="/blocked" />
      {locationSharing!==null?<SettingRow icon="location-outline" title={t('settings.location')} subtitle={t('settings.locationHint')} value={locationSharing} onValueChange={value=>{void changeLocation(value);}} />:<Button variant="secondary" label={t('location.verifyAgain')} onPress={()=>void changeLocation(true)} />}
    </View>
    <Text style={[textStyles.eyebrow,styles.section,{color:theme.colors.textMuted}]}>{t('settings.safety')}</Text>
    <View style={[styles.group,{backgroundColor:theme.colors.surface,borderColor:theme.colors.border}]}>
      <SettingRow icon="help-buoy-outline" title={t('settings.support')} href="/support" />
      <SettingRow icon="log-out-outline" title={t('settings.signOut')} danger onPress={()=>{void signOut().catch(()=>setError(true));}} />
    </View>
    <Text style={[styles.version,{color:theme.colors.textMuted}]}>{t('settings.version')}</Text>
  </View></Screen>;
}
const styles=StyleSheet.create({page:{padding:18,gap:10},section:{marginTop:16},group:{borderWidth:StyleSheet.hairlineWidth,borderRadius:22,padding:15,gap:10},label:{fontSize:15,fontWeight:'800',marginTop:4},choices:{flexDirection:'row',flexWrap:'wrap',gap:8},version:{textAlign:'center',fontSize:12,marginTop:20}});
