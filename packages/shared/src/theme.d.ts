export type ColorScheme = 'light' | 'dark';
export declare const themes: Record<ColorScheme, Record<string, string>>;
/** CSS custom properties (`--us-*`, RGB channels) for a scheme. */
export declare function themeVars(scheme: ColorScheme): Record<string, string>;
export declare const themedTailwind: Record<string, unknown>;
