import { HOUSE_PACK_VERSION, housePackBase, packChanges, readManifest, type PackManifest } from '@us/shared/house/light';
import type { UsClient } from '@us/shared';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Our House's art pack on this phone: downloaded only when asked, kept in
 * the app's documents (so the system doesn't clear it), removable from
 * Settings. Each file is checked against the manifest's SHA-256; a file that
 * finished stays, so a download that stopped picks up where it was. A new
 * pack version only fetches the files that changed.
 */

const root = () => new Directory(Paths.document, 'house');
const folder = () => new Directory(root(), `v${HOUSE_PACK_VERSION}`);
const kept = () => new File(folder(), 'manifest.json');

export type PackState =
  | { kind: 'none' }
  | { kind: 'downloading'; done: number; total: number }
  /** old: an earlier version, still used until the new one is downloaded. */
  | { kind: 'ready'; dir: string; bytes: number; old?: boolean }
  | { kind: 'error'; message: string };

/** A version's folder on the phone and its manifest, if it finished downloading. */
function finished(dir: Directory): PackManifest | null {
  try {
    const f = new File(dir, 'manifest.json');
    return f.exists ? readManifest(JSON.parse(f.textSync())) : null;
  } catch {
    return null;
  }
}

/** Older versions on the phone, newest first. */
function olderFolders(): Directory[] {
  const r = root();
  if (!r.exists) return [];
  return r
    .list()
    .filter((e): e is Directory => e instanceof Directory && /^v\d+$/.test(e.name) && Number(e.name.slice(1)) < HOUSE_PACK_VERSION)
    .sort((a, b) => Number(b.name.slice(1)) - Number(a.name.slice(1)));
}

const uriOf = (d: Directory) => d.uri.replace(/\/$/, '');

/** What's on the phone now: this version, or an older one to use meanwhile, or nothing. */
export function packOnPhone(): PackState {
  const now = finished(folder());
  if (now) return { kind: 'ready', dir: uriOf(folder()), bytes: now.bytes };
  for (const dir of olderFolders()) {
    const m = finished(dir);
    if (m) return { kind: 'ready', dir: uriOf(dir), bytes: m.bytes, old: true };
  }
  return { kind: 'none' };
}

/** The pack's size before downloading, for the button ("Download 32 MB"). */
export async function packSizeToFetch(sb: UsClient): Promise<number> {
  const base = await housePackBase(sb);
  const res = await fetch(`${base}/manifest.json`);
  if (!res.ok) throw new Error('The house isn’t available right now');
  const m = readManifest(await res.json());
  if (!m) throw new Error('The house isn’t available right now');
  // What an older version on the phone already has doesn't count.
  const had = olderFolders().map(finished).find(Boolean) ?? null;
  return packChanges(had, m).reduce((n, f) => n + f.size, 0);
}

/**
 * Download what's missing or changed. Progress goes to `onState`; `signal`
 * pauses (what's finished is kept).
 */
export async function downloadPack(sb: UsClient, onState: (s: PackState) => void, signal?: AbortSignal): Promise<PackState> {
  const base = await housePackBase(sb);
  const res = await fetch(`${base}/manifest.json`, { signal });
  const want = res.ok ? readManifest(await res.json()) : null;
  if (!want) throw new Error('The house isn’t available right now');
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });

  // Files already here and right count as done, whatever the last manifest said.
  const todo = [];
  for (const f of want.files) {
    const file = new File(dir, f.path);
    if (file.exists && file.size === f.size && (await digest(file)) === f.sha256) continue;
    todo.push(f);
  }
  const total = todo.reduce((n, f) => n + f.size, 0);
  let done = 0;
  onState({ kind: 'downloading', done, total });
  const older = olderFolders();
  for (const f of todo) {
    const file = new File(dir, f.path);
    const sub = new Directory(dir, ...f.path.split('/').slice(0, -1));
    if (!sub.exists) sub.create({ intermediates: true });
    // Unchanged since the last version: copy it over instead of downloading it again.
    let same: File | null = null;
    for (const o of older) {
      const prev = new File(o, f.path);
      if (prev.exists && prev.size === f.size && (await digest(prev)) === f.sha256) {
        same = prev;
        break;
      }
    }
    if (same) {
      if (file.exists) file.delete();
      same.copy(file);
      done += f.size;
      onState({ kind: 'downloading', done, total });
      continue;
    }
    await File.downloadFileAsync(`${base}/${f.path}`, file, {
      idempotent: true,
      signal,
      onProgress: ({ bytesWritten }) => onState({ kind: 'downloading', done: done + bytesWritten, total }),
    });
    if (file.size !== f.size || (await digest(file)) !== f.sha256) {
      file.delete();
      throw new Error('A file came down damaged. Try again.');
    }
    done += f.size;
    onState({ kind: 'downloading', done, total });
  }
  kept().write(JSON.stringify(want));
  removeOldVersions();
  const ready: PackState = { kind: 'ready', dir: dir.uri.replace(/\/$/, ''), bytes: want.bytes };
  onState(ready);
  return ready;
}

/** Free the space. What we did in the house is saved on the server, so it all comes back after downloading again. */
export function removePack() {
  const r = root();
  if (r.exists) r.delete();
}

function removeOldVersions() {
  const r = root();
  if (!r.exists) return;
  for (const entry of r.list()) {
    if (entry instanceof Directory && entry.name !== `v${HOUSE_PACK_VERSION}`) entry.delete();
  }
}

async function digest(file: File): Promise<string> {
  return (await file.digest('SHA-256')).toLowerCase();
}

export type { PackManifest };

// ---------------------------------------------------------------------------
// One download for the whole app, so it carries on while you look elsewhere,
// and the Connect card and Settings show the same thing.

let state: PackState | null = null;
let running: AbortController | null = null;
const listeners = new Set<() => void>();

function set(s: PackState) {
  state = s;
  for (const fn of [...listeners]) fn();
}

export function packState(): PackState {
  if (!state) state = packOnPhone();
  return state;
}

export function subscribePack(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function startPackDownload(sb: UsClient) {
  if (running) return;
  const ctrl = new AbortController();
  running = ctrl;
  void downloadPack(sb, set, ctrl.signal)
    .catch((e: unknown) => {
      if (ctrl.signal.aborted) set(packOnPhone());
      else set({ kind: 'error', message: e instanceof Error ? e.message : 'Couldn’t download the house' });
    })
    .finally(() => {
      if (running === ctrl) running = null;
    });
}

/** Stop for now; finished files stay, so it continues from here next time. */
export function pausePackDownload() {
  running?.abort();
  running = null;
}

export function removePackNow() {
  pausePackDownload();
  removePack();
  set({ kind: 'none' });
}
