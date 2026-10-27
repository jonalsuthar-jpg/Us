import { requireOptionalNativeModule } from 'expo-modules-core';

interface UsCutoutNative {
  cutout(uri: string, outline: number, size: number): Promise<{ uri: string; width: number; height: number } | null>;
}

/** Android only, and only in app builds that include it; absent elsewhere. */
const native = requireOptionalNativeModule<UsCutoutNative>('UsCutout');

/** Whether this app build can lift a subject out of a photo. */
export const canCutout = !!native;

/**
 * Lift the subject out of a photo into a transparent `size` square PNG, with a
 * white outline `outline` px wide (0 for none). Null when no subject was found,
 * or when this build can't cut out.
 */
export async function cutout(uri: string, opts: { outline?: number; size?: number } = {}) {
  if (!native) return null;
  return native.cutout(uri, Math.max(0, Math.round(opts.outline ?? 14)), opts.size ?? 512);
}
