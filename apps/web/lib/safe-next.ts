/** A `?next=` target we'll follow: a path on this site, never `//host` or `/\host`. */
export function safeNext(next: string | null | undefined, fallback = '/home'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}
