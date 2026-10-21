import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CoupleContext, HomeData } from '@us/shared';

/**
 * What the app last knew about us, kept on the device so a cold start can
 * draw Home straight away and refresh from the server behind it.
 */
const key = (userId: string, what: 'ctx' | 'home') => `us.boot.${what}.${userId}`;

let home: HomeData | undefined;

export async function readBoot(userId: string): Promise<CoupleContext | null> {
  try {
    const [ctx, h] = (await AsyncStorage.multiGet([key(userId, 'ctx'), key(userId, 'home')])).map(([, v]) => v);
    home = h ? (JSON.parse(h) as HomeData) : undefined;
    return ctx ? (JSON.parse(ctx) as CoupleContext) : null;
  } catch {
    return null;
  }
}

export function saveContext(userId: string, ctx: CoupleContext | null) {
  const k = key(userId, 'ctx');
  void (ctx ? AsyncStorage.setItem(k, JSON.stringify(ctx)) : AsyncStorage.multiRemove([k, key(userId, 'home')])).catch(() => {});
}

/** Home as of the last launch, for the first render; a fresh load replaces it at once. */
export function bootHome(): HomeData | undefined {
  return home;
}

export function saveHome(userId: string, data: HomeData) {
  void AsyncStorage.setItem(key(userId, 'home'), JSON.stringify(data)).catch(() => {});
}
