import { Alert, Platform } from 'react-native';

/** React Native Web's Alert is a no-op; keep failures visible on both platforms. */
export function notifyAction(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
