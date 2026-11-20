import { describe, expect, it } from 'vitest';
import { packChanges, packSize, readManifest } from '../src/house/pack';

const sha = (c: string) => c.repeat(64);

describe('house pack', () => {
  it('reads a manifest and adds up its size', () => {
    const m = readManifest({ version: 1, files: [{ path: 'ground.glb', size: 10, sha256: sha('a') }, { path: 'models/sofa_03.glb', size: 5, sha256: sha('b') }] });
    expect(m).toEqual({ version: 1, bytes: 15, files: expect.any(Array) });
    expect(m!.files).toHaveLength(2);
  });

  it('drops files that could write outside the pack, or are broken', () => {
    const m = readManifest({
      version: 1,
      files: [
        { path: '../evil.glb', size: 1, sha256: sha('a') },
        { path: 'C:/x.glb', size: 1, sha256: sha('a') },
        { path: 'ok.glb', size: 0, sha256: sha('a') },
        { path: 'ok.glb', size: 1, sha256: 'nope' },
        { path: 'fine.glb', size: 1, sha256: sha('c') },
      ],
    });
    expect(m!.files.map((f) => f.path)).toEqual(['fine.glb']);
    expect(readManifest(null)).toBeNull();
    expect(readManifest({ version: 1 })).toBeNull();
  });

  it('downloads only what changed', () => {
    const old = readManifest({ version: 1, files: [{ path: 'a.glb', size: 1, sha256: sha('a') }, { path: 'b.glb', size: 1, sha256: sha('b') }] })!;
    const next = readManifest({ version: 2, files: [{ path: 'a.glb', size: 1, sha256: sha('a') }, { path: 'b.glb', size: 2, sha256: sha('c') }, { path: 'c.glb', size: 3, sha256: sha('d') }] })!;
    expect(packChanges(old, next).map((f) => f.path)).toEqual(['b.glb', 'c.glb']);
    expect(packChanges(null, next)).toHaveLength(3);
  });

  it('says how big it is', () => {
    expect(packSize(32_400_000)).toBe('32 MB');
    expect(packSize(800)).toBe('1 KB');
    expect(packSize(450_000)).toBe('450 KB');
  });
});
