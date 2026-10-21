import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, themeVars, tokens, type ColorScheme } from '@us/shared';
import { vars } from 'nativewind';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';

const { colors } = tokens;

/**
 * Hex colours for the places NativeWind classes can't reach (icon `color`
 * props, ActivityIndicator, navigator styles). Same roles as the --us-*
 * variables, so icons and text flip together.
 */
export interface Palette {
  scheme: ColorScheme;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  paper: string;
  paperRaised: string;
  paperSunken: string;
  /** Behind the chat thread. */
  chat: string;
  edge: string;
  placeholder: string;
  /** Inactive outlines (empty hearts, offline dots). */
  faint: string;
  rose: string;
  roseStrong: string;
  teal: string;
  gold: string;
  sage: string;
  plum: string;
  /** Deep stops used as text/icons on the pale washes; light in dark mode. */
  onRose: string;
  onRoseDeep: string;
  onTeal: string;
  onGold: string;
  onSage: string;
  onPlum: string;
}

function palette(scheme: ColorScheme): Palette {
  const t = themes[scheme];
  return {
    scheme,
    ink: t.ink!,
    inkSoft: t['ink-soft']!,
    inkMuted: t['ink-muted']!,
    paper: t.paper!,
    paperRaised: t['paper-raised']!,
    paperSunken: t['paper-sunken']!,
    chat: t.chat!,
    edge: t['paper-edge']!,
    placeholder: scheme === 'dark' ? colors.plum[400] : colors.plum[300],
    faint: scheme === 'dark' ? colors.plum[600] : colors.plum[200],
    rose: colors.rose[400],
    roseStrong: colors.rose[600],
    teal: colors.teal[500],
    gold: colors.gold[400],
    sage: colors.sage[400],
    plum: colors.plum[500],
    onRose: t['on-rose-700']!,
    onRoseDeep: t['on-rose-800']!,
    onTeal: t['on-teal-700']!,
    onGold: t['on-gold-700']!,
    onSage: t['on-sage-700']!,
    onPlum: t['on-plum-700']!,
  };
}

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'us:theme';
const PALETTES = { light: palette('light'), dark: palette('dark') };
const VARS = { light: vars(themeVars('light')), dark: vars(themeVars('dark')) };

interface ThemeValue {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  palette: Palette;
}

const Ctx = createContext<ThemeValue>({ pref: 'system', setPref: () => {}, palette: PALETTES.light });

/**
 * Resolves the theme (saved choice, else the OS) and provides the --us-*
 * colour variables to every NativeWind class below it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'light' || v === 'dark') setPrefState(v);
    });
  }, []);

  const scheme: ColorScheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo<ThemeValue>(
    () => ({
      pref,
      palette: PALETTES[scheme],
      setPref: (p) => {
        setPrefState(p);
        void (p === 'system' ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, p));
      },
    }),
    [pref, scheme],
  );

  return (
    <Ctx.Provider value={value}>
      <View style={[{ flex: 1, backgroundColor: PALETTES[scheme].paper }, VARS[scheme]]}>{children}</View>
    </Ctx.Provider>
  );
}

export function usePalette(): Palette {
  return useContext(Ctx).palette;
}

export function useThemePref() {
  const { pref, setPref } = useContext(Ctx);
  return { pref, setPref };
}
