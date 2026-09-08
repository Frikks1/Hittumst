import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StartupGate } from '@/components/StartupGate';
import { runtimeEnv } from '@/services/env';
import { AppProvider, useApp } from '@/providers/AppProvider';
import { hittingarFeature, isHittingarRoute } from '@/features/hittingar/config';

function Navigator() {
  const { theme, ready, user, startupError, retryStartup } = useApp();
  const segments = useSegments();

  if (runtimeEnv.configurationIssue) return <StartupGate unavailable />;
  if (!ready) return <StartupGate />;
  if (startupError) return <StartupGate unavailable retry={retryStartup} />;
  const publicRoute = !segments.length || segments[0] === 'auth' || segments[0] === 'support';
  if (!user && !publicRoute) return <Redirect href="/" />;
  if ((segments as readonly string[])[0] === 'groups') return <Redirect href="/(tabs)/discover" />;

  if (!hittingarFeature.enabled && isHittingarRoute(segments)) {
    return <Redirect href="/" />;
  }

  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: theme.colors.canvas } } as never}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/email" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile/[id]" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="report/[profileId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="filters" options={{ presentation: 'modal' }} />
        <Stack.Screen name="my-tags" options={{ presentation: 'modal' }} />
        <Stack.Screen name="albums/index" />
        <Stack.Screen name="albums/[id]" />
        <Stack.Screen name="albums/share" options={{ presentation: 'modal' }} />
        <Stack.Screen name="album-share/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="blocked" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="starred" />
        <Stack.Screen name="groups/index" />
        <Stack.Screen name="groups/[id]" />
        <Stack.Screen name="support" />
        <Stack.Screen name="location-gate" options={{ presentation: 'modal' }} />
        <Stack.Screen name="hittingar/[id]" />
        <Stack.Screen name="hittingar/[id]/manage" />
        <Stack.Screen name="hittingar/[id]/room" />
        <Stack.Screen name="hittingar/[id]/report" options={{ presentation: 'modal' }} />
        <Stack.Screen name="hittingar/create" />
        <Stack.Screen name="hittingar/filters" options={{ presentation: 'modal' }} />
        <Stack.Screen name="hittingar/mine" />
        <Stack.Screen name="hittingar/notifications" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider><Navigator /></AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
