import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { confirmAction } from '@/utils/confirmAction';
import { saveAccountExport } from '@/utils/accountExport';

export default function PrivacyScreen() {
  const {t,theme,signOut,clearLocation}=useApp();
  const [busy,setBusy]=useState<'export'|'withdraw'|'delete'|null>(null);
  const [error,setError]=useState(false);
  const run=async(kind:'export'|'withdraw'|'delete')=>{
    if(busy)return;
    setBusy(kind);setError(false);
    try{
      if(kind==='export')await saveAccountExport(await api.requestExport());
      else {
        if(kind==='withdraw')await api.withdrawSensitiveConsent();else await api.deleteAccount();
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
    </View>
    <View style={[styles.card,{backgroundColor:theme.colors.surface,borderColor:theme.colors.border}]}>
      <Text accessibilityRole="header" style={[textStyles.heading,{color:theme.colors.text}]}>{t('privacy.withdraw')}</Text>
      <Text style={[textStyles.body,{color:theme.colors.textMuted}]}>{t('privacy.withdrawHint')}</Text>
      <Button disabled={Boolean(busy)} loading={busy==='withdraw'} variant="secondary" label={t('privacy.withdraw')} onPress={()=>void run('withdraw')} />
    </View>
    <View style={[styles.card,{borderColor:theme.colors.danger}]}>
      <Text accessibilityRole="header" style={[textStyles.heading,{color:theme.colors.danger}]}>{t('privacy.delete')}</Text>
      <Text style={[textStyles.body,{color:theme.colors.textMuted}]}>{t('privacy.deleteHint')}</Text>
      <Button disabled={Boolean(busy)} loading={busy==='delete'} variant="danger" label={t('privacy.deleteAction')} onPress={remove} />
    </View>
  </View></Screen>;
}
const styles=StyleSheet.create({page:{padding:22,gap:18},card:{borderWidth:1,borderRadius:22,padding:18,gap:14}});
