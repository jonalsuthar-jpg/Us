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
export async function preparePhoto(uri: string, width?: number, height?: number): Promise<ReadyPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > LONG_EDGE) ctx.resize(width >= height ? { width: LONG_EDGE } : { height: LONG_EDGE });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.78 });
  return { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg' };
}
