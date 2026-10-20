import { tokens } from '@us/shared';

const { colors } = tokens;

/**
 * Hex colours for the places NativeWind classes can't reach (icon `color`
 * props, ActivityIndicator, navigator styles).
 */
export interface Palette {
  ink: string;
  inkSoft: string;
  inkMuted: string;
  paper: string;
  paperRaised: string;
  paperSunken: string;
  edge: string;
  placeholder: string;
  rose: string;
  roseStrong: string;
  teal: string;
  gold: string;
  sage: string;
  plum: string;
}

export const LIGHT: Palette = {
  ink: colors.plum[800],
  inkSoft: colors.plum[500],
  inkMuted: colors.plum[400],
  paper: colors.paper.DEFAULT,
  paperRaised: colors.paper.raised,
  paperSunken: colors.paper.sunken,
  edge: colors.paper.edge,
  placeholder: colors.plum[300],
  rose: colors.rose[400],
  roseStrong: colors.rose[600],
  teal: colors.teal[500],
  gold: colors.gold[400],
  sage: colors.sage[400],
  plum: colors.plum[500],
};

export function usePalette(): Palette {
  return LIGHT;
}
