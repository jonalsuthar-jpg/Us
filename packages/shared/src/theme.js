/**
 * Light and dark values for the colours that change with the theme. Plain
 * CommonJS (like tokens.js) so both Tailwind configs can require it.
 *
 * Only *role* colours flip: surfaces (paper), text (ink), the pale washes
 * behind badges and bubbles (50/100), and the deep stops used as text on
 * those washes (600–800). Brand fills (rose-600 buttons, teal-500, gold-400)
 * and night surfaces (plum-800+ call screens) stay the same in both themes.
 *
 * Variables are space-separated RGB channels so Tailwind's
 * `rgb(var(--x) / <alpha-value>)` keeps opacity modifiers (bg-paper/95).
 */
const { colors } = require('./tokens.js');

/** Every themed colour, keyed by the CSS variable suffix. */
const themes = {
  light: {
    paper: colors.paper.DEFAULT,
    'paper-raised': colors.paper.raised,
    'paper-sunken': colors.paper.sunken,
    'paper-edge': colors.paper.edge,
    ink: colors.plum[800],
    'ink-soft': colors.plum[500],
    'ink-muted': colors.plum[400],

    'wash-rose-50': colors.rose[50],
    'wash-rose-100': colors.rose[100],
    'wash-teal-50': colors.teal[50],
    'wash-teal-100': colors.teal[100],
    'wash-gold-50': colors.gold[50],
    'wash-gold-100': colors.gold[100],
    'wash-sage-50': colors.sage[50],
    'wash-sage-100': colors.sage[100],
    'wash-plum-50': colors.plum[50],
    'wash-plum-100': colors.plum[100],

    'line-rose-200': colors.rose[200],
    'line-teal-200': colors.teal[200],

    'on-rose-700': colors.rose[700],
    'on-rose-800': colors.rose[800],
    'on-teal-700': colors.teal[700],
    'on-teal-800': colors.teal[800],
    'on-gold-700': colors.gold[700],
    'on-gold-800': colors.gold[800],
    'on-sage-700': colors.sage[700],
    'on-sage-800': colors.sage[800],
    'on-plum-600': colors.plum[600],
    'on-plum-700': colors.plum[700],
  },
  dark: {
    paper: '#18111A',
    'paper-raised': '#221A25',
    'paper-sunken': '#110C12',
    'paper-edge': '#3A2E3D',
    ink: '#F4EDE6',
    'ink-soft': colors.plum[200],
    'ink-muted': colors.plum[300],

    'wash-rose-50': '#3A2226',
    'wash-rose-100': '#4A2A2F',
    'wash-teal-50': '#1F2B2F',
    'wash-teal-100': '#27373C',
    'wash-gold-50': '#33291A',
    'wash-gold-100': '#43351F',
    'wash-sage-50': '#232A20',
    'wash-sage-100': '#2D3529',
    'wash-plum-50': '#2A1F2D',
    'wash-plum-100': '#382A3B',

    'line-rose-200': colors.rose[700],
    'line-teal-200': colors.teal[600],

    'on-rose-700': colors.rose[200],
    'on-rose-800': colors.rose[100],
    'on-teal-700': colors.teal[200],
    'on-teal-800': colors.teal[100],
    'on-gold-700': colors.gold[200],
    'on-gold-800': colors.gold[100],
    'on-sage-700': colors.sage[200],
    'on-sage-800': colors.sage[100],
    'on-plum-600': colors.plum[200],
    'on-plum-700': colors.plum[100],
  },
};

/** "#FAF6F1" → "250 246 241" */
function channels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** { '--us-paper': '250 246 241', … } for a scheme. */
function themeVars(scheme) {
  return Object.fromEntries(Object.entries(themes[scheme]).map(([k, v]) => [`--us-${k}`, channels(v)]));
}

const v = (name) => `rgb(var(--us-${name}) / <alpha-value>)`;

/**
 * Tailwind theme fragment: role colours point at the variables. Text, background
 * and border colours are overridden separately so e.g. `text-rose-700` flips
 * for dark mode while `hover:bg-rose-700` on a button keeps its fill.
 */
const themedTailwind = {
  colors: {
    paper: { DEFAULT: v('paper'), raised: v('paper-raised'), sunken: v('paper-sunken'), edge: v('paper-edge') },
    ink: { DEFAULT: v('ink'), soft: v('ink-soft'), muted: v('ink-muted') },
  },
  backgroundColor: Object.fromEntries(
    ['rose', 'teal', 'gold', 'sage', 'plum'].map((hue) => [hue, { 50: v(`wash-${hue}-50`), 100: v(`wash-${hue}-100`) }]),
  ),
  borderColor: { rose: { 200: v('line-rose-200') }, teal: { 200: v('line-teal-200') } },
  textColor: {
    // Night surfaces use text-paper: it stays light in both themes.
    paper: colors.paper.DEFAULT,
    rose: { 700: v('on-rose-700'), 800: v('on-rose-800') },
    teal: { 700: v('on-teal-700'), 800: v('on-teal-800') },
    gold: { 700: v('on-gold-700'), 800: v('on-gold-800') },
    sage: { 700: v('on-sage-700'), 800: v('on-sage-800') },
    plum: { 600: v('on-plum-600'), 700: v('on-plum-700') },
  },
};

module.exports = { themes, themeVars, themedTailwind };
