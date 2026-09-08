import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { PublicProfile } from '@/types/domain';

export default function BlockedScreen() {
  const { t, theme } = useApp();
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  useEffect(() => { void api.listBlocked().then(setProfiles); }, []);
  return (
    <Screen back title={t('blocked.title')}>
      <View style={styles.page}>
        {profiles.length === 0 ? <View style={styles.empty}><Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('blocked.empty')}</Text></View> : profiles.map((profile) => (
          <View key={profile.id} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
            <Image source={profile.photos[0]?.url} style={styles.avatar} />
            <Text style={[styles.name, { color: theme.colors.text }]}>{profile.displayName}</Text>
            <Button variant="secondary" label={t('blocked.unblock')} onPress={() => void api.unblock(profile.id).then(() => setProfiles((items) => items.filter((item) => item.id !== profile.id)))} />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { padding: 20 }, row: { minHeight: 82, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 48, height: 48, borderRadius: 16 }, name: { flex: 1, fontWeight: '800', fontSize: 16 }, empty: { minHeight: 400, justifyContent: 'center', alignItems: 'center' } });
