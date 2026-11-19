/**
 * The chat's background, chosen by either of us and seen by both (see
 * public.chat_themes). My bubbles keep my own colour on every theme, so it's
 * always clear who said what.
 */
export type ChatTheme = 'paper' | 'rose' | 'teal' | 'sage' | 'gold' | 'night';

export interface ChatThemeLook {
  label: string;
  /** The thread's background, light and dark. */
  light: string;
  dark: string;
  /** The swatch in the picker. */
  swatch: string;
}

export const CHAT_THEMES: Record<ChatTheme, ChatThemeLook> = {
  paper: { label: 'Paper', light: '#F6F0E8', dark: '#1B1520', swatch: '#EFE6DA' },
  rose: { label: 'Rose', light: '#FBE9EC', dark: '#2A1A22', swatch: '#F6C9D2' },
  teal: { label: 'Teal', light: '#E4F4F1', dark: '#13231F', swatch: '#B7E4DB' },
  sage: { label: 'Garden', light: '#EDF1E7', dark: '#1A1F17', swatch: '#CFDABF' },
  gold: { label: 'Golden', light: '#FBF1DD', dark: '#241D10', swatch: '#F5D99A' },
  night: { label: 'Night', light: '#2A1F2D', dark: '#120D15', swatch: '#3B2A40' },
};

export const CHAT_THEME_ORDER = Object.keys(CHAT_THEMES) as ChatTheme[];

export const isChatTheme = (t: unknown): t is ChatTheme => typeof t === 'string' && t in CHAT_THEMES;

/** The background for a theme in the app's light or dark mode. */
export function chatBackground(theme: ChatTheme | null | undefined, scheme: 'light' | 'dark'): string {
  const look = CHAT_THEMES[isChatTheme(theme) ? theme : 'paper'];
  return scheme === 'dark' ? look.dark : look.light;
}

/** Night is dark even in light mode: the thread's own text (days, typing) goes light on it. */
export const isDarkChat = (theme: ChatTheme | null | undefined, scheme: 'light' | 'dark') => scheme === 'dark' || theme === 'night';
