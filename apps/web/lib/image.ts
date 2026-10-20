/**
 * Downscale a photo to at most `max` px on its long edge and re-encode as
 * JPEG, so uploads stay small. Falls back to the original file when the
 * browser can't decode it (e.g. HEIC outside Safari).
 */
export async function shrinkPhoto(file: File, max = 1800, quality = 0.85): Promise<{ blob: Blob; type: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob) return { blob, type: 'image/jpeg' };
  } catch {
    // fall through to the original
  }
  return { blob: file, type: file.type || 'image/jpeg' };
}
