/**
 * Us design tokens — the single source of truth for web (Tailwind) and mobile
 * (NativeWind). Plain CommonJS so tailwind.config files on both platforms can
 * require it without a build step; typed via tokens.d.ts.
 *
 * Brand anchors (from the design brief) are the `400`/`500`/`800` stops noted
 * below. Text-on-paper and text-on-fill pairings use the deeper stops so body
 * copy stays at WCAG AA contrast.
 */

const colors = {
  // Ink, dark surfaces, call screens. Brand: plum.800 #241933
  plum: {
    50: '#F6F2FA',
    100: '#EBE1F4',
    200: '#D4C2E6',
    300: '#B39ACC',
    400: '#7A5E9A', // muted text on paper (5.2:1)
    500: '#634882', // soft text on paper (7.3:1)
    600: '#4B3468',
    700: '#392751',
    800: '#241933', // brand ink
    900: '#170F21',
    950: '#0D0814',
  },
  // Light surfaces: clean, barely-warm white.
  paper: {
    DEFAULT: '#FCFAFB',
    raised: '#FFFFFF', // a sheet lifted off the page
    sunken: '#F4F0F3', // wells, inputs, inactive tracks
    edge: '#E9E2E8', // hairlines
  },
  // Primary accent, partner A, primary actions. Brand: rose.400 #F5547C
  rose: {
    50: '#FFF0F3',
    100: '#FFDDE5',
    200: '#FFB8C9',
    300: '#FF86A3',
    400: '#F5547C', // brand — large accents, rings, illustration
    500: '#E2336A',
    600: '#C41D55', // button fills / rose text on paper (5.7:1 with white)
    700: '#9C1645',
    800: '#701136',
    900: '#460B22',
  },
  // Secondary accent, partner B. Brand: teal.500 #0C8F82
  teal: {
    50: '#E9FBF7',
    100: '#C8F2EA',
    200: '#91E3D5',
    300: '#50CBB9',
    400: '#1BAE9C',
    500: '#0C8F82', // brand — fills and large accents
    600: '#0A776D', // fills behind white text (5.4:1)
    700: '#095F58',
    800: '#084844',
    900: '#052F2C',
  },
  // Highlights, memories, resurfaced content. Brand: gold.400 #F3A823
  gold: {
    50: '#FFF8E5',
    100: '#FFEDC0',
    200: '#FFD98A',
    300: '#FCC24F',
    400: '#F3A823', // brand
    500: '#D88C0C',
    600: '#AE6F08',
    700: '#7C5006', // gold text on paper
    800: '#563805',
    900: '#352203',
  },
  // Growth & wellbeing. Brand: sage.400 #37AC5F
  sage: {
    50: '#ECFAF0',
    100: '#D0F2DA',
    200: '#A3E2B5',
    300: '#69C987',
    400: '#37AC5F', // brand
    500: '#258F4C',
    600: '#1D743E',
    700: '#185B32',
    800: '#134526',
    900: '#0C2C18',
  },
};

/** Who is who. Partner A created the invite; partner B redeemed it. */
const partner = {
  a: { name: 'rose', base: colors.rose[400], strong: colors.rose[600], wash: colors.rose[50] },
  b: { name: 'teal', base: colors.teal[500], strong: colors.teal[700], wash: colors.teal[50] },
};

/** Module accents — each area of the app owns one colour. */
const modules = {
  talk: colors.rose[400],
  connect: colors.teal[500],
  plan: colors.plum[500],
  memory: colors.gold[400],
  growth: colors.sage[400],
};

const fonts = {
  // Warm serif, only for deliberate moments (memories, empty states) in light / italic.
  serif: 'Fraunces',
  // UI, body, names and headings (bold).
  sans: 'Inter',
};

/** Text on light surfaces: near-black, and two greys that stay easy to read. */
const ink = {
  DEFAULT: '#15121A', // 18.5:1 on white
  soft: '#4A4552', // 9.3:1 — previews, details
  muted: '#6B6573', // 5.6:1 — times, hints
};

/** Type scale in px (line-height in px). */
const type = {
  hero: [44, 48],
  title: [28, 34],
  heading: [21, 27],
  lead: [17, 24], // names, row titles
  body: [16, 22], // messages, body copy
  small: [15, 21], // previews, details
  micro: [13, 18], // labels, times
};

/**
 * Radii are deliberately varied per surface rather than one radius everywhere.
 */
const radii = {
  hair: 4,
  control: 12, // inputs, buttons
  sheet: 20, // paper sheets
  bubble: 16, // chat bubbles (tail corner overrides to `hair`)
  pill: 999,
};

const motion = {
  duration: { quick: 140, base: 220, gentle: 420, slow: 900, breath: 2400 },
  // cubic-bezier control points
  ease: {
    out: [0.22, 1, 0.36, 1],
    inOut: [0.65, 0, 0.35, 1],
    settle: [0.34, 1.32, 0.64, 1], // tiny overshoot for "arrived" moments
  },
};

module.exports = { colors, ink, partner, modules, fonts, type, radii, motion };
