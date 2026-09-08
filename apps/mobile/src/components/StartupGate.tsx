import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Brand, Button, Screen } from './ui';
import { useApp } from '@/providers/AppProvider';
export function StartupGate({ unavailable = false, retry }: { unavailable?: boolean; retry?: () => void }) {
  const { theme, t } = useApp();
  return <Screen scroll={false}><View style={styles.page}>
    <Brand />
    {unavailable ? <>
      <Text accessibilityRole="header" style={[styles.title,{color:theme.colors.text}]}>{t('startup.unavailable')}</Text>
      <Text accessibilityRole="alert" style={[styles.body,{color:theme.colors.textMuted}]}>{t('startup.help')}</Text>
      {retry && <Button label={t('common.retry')} onPress={retry} />}
    </> : <ActivityIndicator accessibilityLabel={t('common.loading')} size="large" color={theme.colors.accent} />}
  </View></Screen>;
}
const styles=StyleSheet.create({page:{flex:1,padding:28,justifyContent:'center',alignItems:'center',gap:24},title:{fontSize:26,fontWeight:'800',textAlign:'center'},body:{fontSize:16,lineHeight:24,textAlign:'center'}});
