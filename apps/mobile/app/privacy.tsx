import { suspendNativeDiagnostics } from '@/services/nativeDiagnostics';
import { APPLE_MANUAL_REVOCATION_URL, prepareAppleAccountDeletion } from '@/services/appleAccount';
import { Text } from '@/components/Typography';
import { useEffect, useState } from 'react';
import { type Href, useRouter } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api, authService } from '@/services';
import { confirmAction } from '@/utils/confirmAction';
import { saveAccountExport } from '@/utils/accountExport';

export default function PrivacyScreen() {
  const {t,theme,signOut,clearLocation,locale,user}=useApp();
  const router=useRouter();
  const [busy,setBusy]=useState<'export'|'withdraw'|'delete'|null>(null);
  const [error,setError]=useState(false);
  const [manualApple,setManualApple]=useState(false);
  const is=locale==='is';
  useEffect(()=>{setManualApple(false);setError(false);},[user?.id]);
  const run=async(kind:'export'|'withdraw'|'delete',skipApple=false)=>{
    if(busy||!user)return;
    const accountId=user.id;
    setBusy(kind);setError(false);
    try{
      if(kind==='export')await saveAccountExport(await api.requestExport());
      else {
        if(kind==='withdraw'){await suspendNativeDiagnostics();await api.withdrawSensitiveConsent();}else {
          const preparation=skipApple?'ready':await prepareAppleAccountDeletion(accountId);
          if((await authService.getUser())?.id!==accountId)throw Error('authentication_required');
          if(preparation==='manual_revocation'){setManualApple(true);return;}
          await suspendNativeDiagnostics();
          await api.deleteAccount();
        }
        clearLocation();await signOut();
      }
    }catch{setError(true);}
    finally{setBusy(null);}
  };
  const remove=()=>confirmAction({title:t('privacy.deleteConfirmTitle'),message:t('privacy.deleteConfirmBody'),cancelLabel:t('common.cancel'),confirmLabel:t('privacy.deleteAction'),destructive:true,onConfirm:()=>run('delete')});
  return <Screen back title={t('privacy.title')}><View style={styles.page}>
    <Text style={[textStyles.body,{color:theme.colors.textMuted}]}>{t('privacy.body')}</Text>
    {error&&<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{t('privacy.actionFailed')}</Text>}
    <View style={[styles.card,{backgroundColor:theme.colors.surface,borderColor:theme.colors.border}]}>
      <Text accessibilityRole="header" style={[textStyles.heading,{color:theme.colors.text}]}>{t('privacy.export')}</Text>
      <Text style={[textStyles.body,{color:theme.colors.textMuted}]}>{t('privacy.exportHint')}</Text>
      <Button disabled={Boolean(busy)} loading={busy==='export'} variant="secondary" label={t('privacy.shareExport')} onPress={()=>void run('export')} />
      <Button disabled={Boolean(busy)} variant="secondary" label={locale==='is' ? 'Sækja eigin myndir og myndskeið' : 'Download my photos and videos'} onPress={()=>router.push('/media-export' as Href)} />
    </View>
    <View style={[styles.card,{backgroundColor:theme.colors.surface,borderColor:theme.colors.border}]}>
      <Text accessibilityRole="header" style={[textStyles.heading,{color:theme.colors.text}]}>{t('privacy.withdraw')}</Text>
      <Text style={[textStyles.body,{color:theme.colors.textMuted}]}>{t('privacy.withdrawHint')}</Text>
      <Button disabled={Boolean(busy)} loading={busy==='withdraw'} variant="secondary" label={t('privacy.withdraw')} onPress={()=>void run('withdraw')} />
    </View>
    {manualApple&&<View style={[styles.card,{backgroundColor:theme.colors.surface,borderColor:theme.colors.border}]}>
      <Text accessibilityRole="alert" style={[textStyles.heading,{color:theme.colors.text}]}>{is?'Þú getur samt eytt aðganginum':'You can still delete your account'}</Text>
      <Text style={[textStyles.body,{color:theme.colors.textMuted}]}>{is?'Ekki tókst að ljúka heimild frá Apple. Eyðing aðgangsins getur haldið áfram. Eftir eyðingu skaltu opna Stillingar á iPhone, velja nafnið þitt, Innskráning með Apple, Hittumst og Eyða. Á vefnum: account.apple.com → Innskráning og öryggi → Innskráning með Apple.':'Apple authorization could not be completed. You can continue deleting your account. Afterwards, open iPhone Settings → your name → Sign in with Apple → Hittumst → Delete. On the web: account.apple.com → Sign-In & Security → Sign in with Apple.'}</Text>
      <Button disabled={Boolean(busy)} variant="secondary" label={is?'Leiðbeiningar frá Apple':'Apple instructions'} onPress={()=>{void Linking.openURL(APPLE_MANUAL_REVOCATION_URL).catch(()=>setError(true));}} />
      <Button disabled={Boolean(busy)} variant="secondary" label={is?'Reyna Apple aftur':'Retry Apple authorization'} onPress={()=>void run('delete')} />
      <Button disabled={Boolean(busy)} loading={busy==='delete'} variant="danger" label={is?'Halda áfram að eyða aðgangi':'Continue account deletion'} onPress={()=>confirmAction({title:t('privacy.deleteConfirmTitle'),message:t('privacy.deleteConfirmBody'),cancelLabel:t('common.cancel'),confirmLabel:t('privacy.deleteAction'),destructive:true,onConfirm:()=>run('delete',true)})} />
    </View>}
    <View style={[styles.card,{borderColor:theme.colors.danger}]}>
      <Text accessibilityRole="header" style={[textStyles.heading,{color:theme.colors.danger}]}>{t('privacy.delete')}</Text>
      <Text style={[textStyles.body,{color:theme.colors.textMuted}]}>{t('privacy.deleteHint')}</Text>
      <Button disabled={Boolean(busy)} loading={busy==='delete'} variant="danger" label={t('privacy.deleteAction')} onPress={remove} />
    </View>
  </View></Screen>;
}
const styles=StyleSheet.create({page:{padding:22,gap:18},card:{borderWidth:1,borderRadius:22,padding:18,gap:14}});
