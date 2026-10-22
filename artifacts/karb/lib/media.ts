import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FS from 'expo-file-system/legacy';

export type PickResult =
  | { ok: true; uri: string; dataUrl: string }
  | { ok: false; reason: 'cancelled' | 'denied' | 'error' | 'too_large'; message?: string };

const MAX = 5 * 1024 * 1024;

export async function pickImage(source: 'camera' | 'library'): Promise<PickResult> {
  try {
    if (source === 'camera' && Platform.OS !== 'web') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return { ok: false, reason: 'denied' };
    }
    if (source === 'library' && Platform.OS !== 'web') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) return { ok: false, reason: 'denied' };
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets?.[0]) return { ok: false, reason: 'cancelled' };
    const a = r.assets[0];
    let width = 1280;
    for (let i = 0; i < 3; i++) {
      const m = await manipulateAsync(a.uri, [{ resize: { width: Math.min(width, a.width || width) } }], {
        compress: 0.7 - i * 0.15, format: SaveFormat.JPEG, base64: true,
      });
      if (m.base64 && m.base64.length * 0.75 <= MAX) {
        // Blob URLs expire on reload. Keep a small durable thumbnail in the local web log.
        let uri = m.uri;
        if (Platform.OS === 'web') {
          const thumbnail = await manipulateAsync(m.uri, [{ resize: { width: 240 } }], {
            compress: 0.5, format: SaveFormat.JPEG, base64: true,
          });
          if (!thumbnail.base64) throw new Error('Kunne ikke lagre miniatyrbildet.');
          uri = `data:image/jpeg;base64,${thumbnail.base64}`;
        }
        return { ok: true, uri, dataUrl: `data:image/jpeg;base64,${m.base64}` };
      }
      width = Math.round(width * 0.7);
    }
    return { ok: false, reason: 'too_large' };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error)?.message };
  }
}

export async function fileToBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  return FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
}

export async function audioMime(uri: string) {
  if (Platform.OS === 'web') {
    const type = (await (await fetch(uri)).blob()).type.split(';')[0];
    if (!type) throw new Error('Nettleseren oppga ikke lydformatet. Bruk tekst i stedet.');
    return type;
  }
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (ext === 'caf') return 'audio/x-caf';
  if (ext === 'wav') return 'audio/wav';
  if (ext === '3gp') return 'audio/3gpp';
  return 'audio/mp4';
}
