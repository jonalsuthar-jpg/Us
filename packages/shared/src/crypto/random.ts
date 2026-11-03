/**
 * Secure random bytes, looked up on every call. (Noble's own helper captures
 * `globalThis.crypto` once, when it loads — on a phone that can be before the
 * app has installed its getRandomValues, and then it never works.)
 */
export function randomBytes(length: number): Uint8Array {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!c?.getRandomValues) throw new Error('no_secure_random');
  return c.getRandomValues(new Uint8Array(length));
}
