export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'us:theme';

/**
 * Runs inline in <head> before first paint so the page never flashes the
 * wrong theme. Kept dependency-free and in sync with applyTheme below.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(pref: ThemePref) {
  const scheme = resolve(pref);
  document.documentElement.dataset.theme = scheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scheme === 'dark' ? '#0E0A11' : '#FCFAFB');
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // private mode — the choice just won't persist
  }
  applyTheme(pref);
}

/** Follow OS changes while the preference is "system". Returns an unsubscribe. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getThemePref() === 'system') applyTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
