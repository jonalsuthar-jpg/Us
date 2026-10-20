import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Coords } from '@us/shared';
import * as Location from 'expo-location';

const HOME_KEY = 'us.home-spot';

/** Ask (if needed) for while-in-use location, then take one fix. */
export async function currentPosition(): Promise<Coords> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Allow location for Us in Settings to share where you are.');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
}

/** A fix only if permission was already given, so nothing prompts by surprise. */
export async function quietPosition(): Promise<Coords | null> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  return p ? { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } : null;
}

/** Follow my position while sharing. Returns a stop function. */
export async function watchPosition(onFix: (c: Coords) => void): Promise<() => void> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return () => {};
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 60_000, distanceInterval: 100 },
    (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
  );
  return () => sub.remove();
}

/** The "home" spot lives only on this phone; it is never sent anywhere. */
export async function getHomeSpot(): Promise<Coords | null> {
  const raw = await AsyncStorage.getItem(HOME_KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as Coords) : null;
}

export async function setHomeSpot(c: Coords | null) {
  if (c) await AsyncStorage.setItem(HOME_KEY, JSON.stringify({ lat: c.lat, lng: c.lng }));
  else await AsyncStorage.removeItem(HOME_KEY);
}
