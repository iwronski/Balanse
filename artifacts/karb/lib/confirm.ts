import { Alert, Platform } from 'react-native';

export function confirmAsync(title: string, msg: string, ok: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((res) => Alert.alert(title, msg, [
    { text: 'Avbryt', style: 'cancel', onPress: () => res(false) },
    { text: ok, style: 'destructive', onPress: () => res(true) },
  ]));
}
