import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DataCacheStore } from '@us/shared/react';

/** Each screen's last-known data, one AsyncStorage key per entry. */
const PREFIX = 'us.cache.';

export const dataCacheStore: DataCacheStore = {
  async load() {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    const out: Record<string, unknown> = {};
    for (const [k, v] of await AsyncStorage.multiGet(keys)) {
      if (!v) continue;
      try {
        out[k.slice(PREFIX.length)] = JSON.parse(v);
      } catch {
        // A damaged entry: skip it, the next load replaces it.
      }
    }
    return out;
  },
  save(key, value) {
    void AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
  },
  clear() {
    void AsyncStorage.getAllKeys()
      .then((keys) => AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX))))
      .catch(() => {});
  },
};
