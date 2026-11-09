/**
 * After a deploy, a tab that was already open still runs the old build. The
 * first time it moves to a page it hasn't loaded yet, it asks for that page's
 * code from the old build, which is gone, and the page fails. A full reload
 * picks up the new build. Reloads at most once a minute, so a real error
 * can't loop.
 */
const STALE = /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|Failed to load|fetch failed|server components? render/i;
const KEY = 'us:stale-reload-at';

export function isStaleDeploy(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  return !!e && STALE.test(`${e.name ?? ''} ${e.message ?? ''}`);
}

/** Reload to the new build if this looks like one; true when it reloads. */
export function reloadIfStale(error: unknown): boolean {
  if (!isStaleDeploy(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No session storage: reload anyway, once per page.
    if ((window as { __usReloaded?: boolean }).__usReloaded) return false;
    (window as { __usReloaded?: boolean }).__usReloaded = true;
  }
  window.location.reload();
  return true;
}
