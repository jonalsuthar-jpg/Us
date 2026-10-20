/** Tiny class joiner (NativeWind resolves conflicts by order). */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
