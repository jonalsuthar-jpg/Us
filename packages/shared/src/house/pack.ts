/**
 * Our House's art pack: the realistic house, its baked light and the
 * furniture, built by scripts/blender and uploaded by
 * scripts/build-house-assets.mjs to R2 under house/v<version>/, which the
 * media Worker serves to anyone (it's free CC0 art, the same for all of us).
 *
 * The phone downloads it once, only if you ask, and can remove it; the web
 * reads it straight from there and lets the browser cache it.
 */

/** Bump when the art changes; old versions stay where they are until removed. */
export const HOUSE_PACK_VERSION = 4;

export interface PackFile {
  path: string;
  size: number;
  sha256: string;
}

export interface PackManifest {
  version: number;
  bytes: number;
  files: PackFile[];
}

export function readManifest(v: unknown): PackManifest | null {
  const m = v as Partial<PackManifest> | null;
  if (!m || typeof m.version !== 'number' || !Array.isArray(m.files)) return null;
  const files = m.files.filter(
    (f): f is PackFile =>
      !!f && typeof f.path === 'string' && /^[a-z0-9_./-]+$/.test(f.path) && !f.path.includes('..') && Number.isInteger(f.size) && f.size > 0 && typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256),
  );
  return { version: m.version, bytes: files.reduce((n, f) => n + f.size, 0), files };
}

/** What a new manifest needs that an old copy doesn't have: only changed files download again. */
export function packChanges(had: PackManifest | null, want: PackManifest): PackFile[] {
  const old = new Map((had?.files ?? []).map((f) => [f.path, f.sha256]));
  return want.files.filter((f) => old.get(f.path) !== f.sha256);
}

/** "32 MB" */
export const packSize = (bytes: number) => (bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
