import { setKeyStore, setMediaVault, type KeyStore, type MediaVault } from '@us/shared';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

/**
 * Encrypted chat on the phone: the device key and chat key in the Keychain /
 * Keystore (this device only, never in backups), and opened photos and voice
 * notes in the cache folder. Random numbers come from lib/random-polyfill.
 */

const SECURE = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

const keyStore: KeyStore = {
  get: (name) => SecureStore.getItemAsync(name, SECURE),
  set: (name, value) => SecureStore.setItemAsync(name, value, SECURE),
  remove: (name) => SecureStore.deleteItemAsync(name, SECURE),
};

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
};

const folder = () => new Directory(Paths.cache, 'chat-media');
// "<couple>/<id>.enc" → one flat file name; the extension tells the players what it is.
const fileFor = (path: string, mime?: string) => {
  const base = path.replace(/[^A-Za-z0-9-]/g, '_');
  return mime ? new File(folder(), `${base}.${EXT[mime] ?? 'bin'}`) : null;
};

// Which file each path was saved as, so `get` doesn't need the type.
const saved = new Map<string, string>();

const mediaVault: MediaVault = {
  async put(path, bytes, mime) {
    const dir = folder();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = fileFor(path, mime)!;
    if (!file.exists) {
      file.create();
      await file.write(bytes);
    }
    saved.set(path, file.uri);
    return file.uri;
  },
  async get(path) {
    const known = saved.get(path);
    if (known) return known;
    // After a restart: look for a file saved under any type.
    const dir = folder();
    if (!dir.exists) return null;
    const base = path.replace(/[^A-Za-z0-9-]/g, '_');
    for (const ext of new Set(Object.values(EXT).concat('bin'))) {
      const file = new File(dir, `${base}.${ext}`);
      if (file.exists) {
        saved.set(path, file.uri);
        return file.uri;
      }
    }
    return null;
  },
  async clear() {
    saved.clear();
    const dir = folder();
    if (dir.exists) dir.delete();
  },
};

setKeyStore(keyStore);
setMediaVault(mediaVault);
