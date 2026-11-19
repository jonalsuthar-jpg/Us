import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Long edge of a photo sent in chat: sharp on any phone, a fraction of the camera's file. */
const LONG_EDGE = 1600;

export interface ReadyPhoto {
  uri: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
}

/**
 * Any photo (camera, gallery, HEIC on iOS) as a JPEG no bigger than it needs
 * to be, so it uploads quickly and opens on every device.
 */
export async function preparePhoto(uri: string, width?: number, height?: number, longEdge = LONG_EDGE): Promise<ReadyPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > longEdge) ctx.resize(width >= height ? { width: longEdge } : { height: longEdge });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.78 });
  return { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg' };
}

/** Long edge of a profile photo: it's only ever shown small. */
export const AVATAR_EDGE = 512;

/**
 * A picked photo, made upload-ready (see preparePhoto). Falls back to the
 * picker's file if it can't be re-encoded, so a pick never just fails.
 */
export async function readyPicked(asset: { uri: string; width?: number; height?: number; mimeType?: string | null }, longEdge = LONG_EDGE): Promise<{ uri: string; mimeType: string }> {
  try {
    return await preparePhoto(asset.uri, asset.width, asset.height, longEdge);
  } catch {
    return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
  }
}
