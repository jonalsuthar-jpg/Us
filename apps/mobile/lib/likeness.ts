import { LIKENESS_VERSION, type Likeness } from '@us/shared/house';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * The two of us as ourselves on this phone: each downloaded once from its
 * private link and kept in the app's documents, so the house loads it from
 * the phone like the rest of the art. A new version replaces the old file.
 */
export async function keepLikeness(who: Likeness, url: string): Promise<string> {
  const dir = new Directory(Paths.document, 'likeness');
  if (!dir.exists) dir.create({ intermediates: true });
  const name = `body_${who}_v${LIKENESS_VERSION}.glb`;
  const file = new File(dir, name);
  if (file.exists && file.size > 0) return file.uri;
  for (const old of dir.list()) if (old instanceof File && old.name.startsWith(`body_${who}_`)) old.delete();
  // Into a part file first, so a download that stops never looks finished.
  const part = new File(dir, `${name}.part`);
  await File.downloadFileAsync(url, part, { idempotent: true });
  part.move(file);
  return file.uri;
}
