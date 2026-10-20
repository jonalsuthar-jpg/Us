import type { Coords } from '@us/shared';

const HOME_KEY = 'us.home-spot';

/** One position fix. Rejects with a friendly message. */
export function currentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This browser can’t share location.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location is blocked for this site. Allow it in your browser settings.' : 'Couldn’t find your location just now.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

/** True only if the browser already allows location, so we never prompt by surprise. */
export async function locationAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/** The "home" spot lives only on this device; it is never sent anywhere. */
export function getHomeSpot(): Coords | null {
  try {
    const raw = localStorage.getItem(HOME_KEY);
    return raw ? (JSON.parse(raw) as Coords) : null;
  } catch {
    return null;
  }
}

export function setHomeSpot(c: Coords | null) {
  try {
    if (c) localStorage.setItem(HOME_KEY, JSON.stringify({ lat: c.lat, lng: c.lng }));
    else localStorage.removeItem(HOME_KEY);
  } catch {
    // storage unavailable (private mode): the feature just stays manual
  }
}
