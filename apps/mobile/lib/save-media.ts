import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';

/**
 * Save a chat photo, video, GIF or sticker to the phone's gallery. Files we
 * opened on this phone are saved as they are; links (GIPHY, signed files)
 * are downloaded first. Throws with a message to show when it can't.
 */
export async function saveToGallery(uri: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync(true, ['photo', 'video']);
  if (!perm.granted) throw new Error('Allow Us to save to Photos in Settings first.');
  let local = uri;
  if (/^https?:/.test(uri)) {
    const dir = new Directory(Paths.cache, 'saved');
    if (!dir.exists) dir.create({ intermediates: true });
    local = (await File.downloadFileAsync(uri, dir, { idempotent: true })).uri;
  }
  await MediaLibrary.saveToLibraryAsync(local);
}
