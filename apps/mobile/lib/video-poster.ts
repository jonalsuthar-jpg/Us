import { POSTER_MAX_CHARS } from '@us/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createVideoPlayer } from 'expo-video';

/**
 * A small still from early in a clip, as a JPEG data URL, for the bubble to
 * show before the video plays. Null when the phone can't make one (the bubble
 * then shows its plain dark box); it never holds up sending for long.
 */
export async function videoPosterOf(uri: string): Promise<string | null> {
  const player = createVideoPlayer(uri);
  try {
    const work = (async () => {
      const [thumb] = await player.generateThumbnailsAsync(0.3, { maxWidth: 240 });
      if (!thumb) return null;
      const image = await ImageManipulator.manipulate(thumb).renderAsync();
      for (const compress of [0.6, 0.45, 0.3]) {
        const out = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
        const url = out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
        if (url && url.length <= POSTER_MAX_CHARS) return url;
      }
      return null;
    })();
    const late = new Promise<null>((r) => setTimeout(() => r(null), 3000));
    return await Promise.race([work, late]);
  } catch {
    return null;
  } finally {
    player.release();
  }
}
