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
  // Ink, dark surfaces, call screens. Brand: plum.800 #2A1F2D
  plum: {
    50: '#F5F1F5',
    100: '#E7DEE8',
    200: '#CDBCCF',
    300: '#A994AC',
    400: '#7F6683', // muted text on paper (4.7:1)
    500: '#5C4660', // soft text on paper (8:1)
    600: '#46344A',
    700: '#382A3B',
    800: '#2A1F2D', // brand ink
    900: '#1C141E',
    950: '#120C13',
  },
  // Light surfaces. Brand: paper.DEFAULT #FAF6F1
  paper: {
    DEFAULT: '#FAF6F1',
    raised: '#FFFDFA', // a sheet lifted off the page
    sunken: '#F2EBE2', // wells, inputs, inactive tracks
    edge: '#E4D9CC', // hairlines
  },
  // Primary accent, partner A, primary actions. Brand: rose.400 #C8686B
  rose: {
    50: '#FBEFEE',
    100: '#F5DCDA',
    200: '#EBB9B7',
    300: '#DD9192',
    400: '#C8686B', // brand — large accents, rings, illustration
    500: '#B5555A',
    600: '#9E4247', // button fills / rose text on paper (5.6:1 with white)
    700: '#7F3439',
    800: '#5E282C',
    900: '#3E1C1F',
  },
  // Secondary accent, partner B. Brand: teal.500 #4A6670
  teal: {
    50: '#EEF3F4',
    100: '#D8E3E6',
    200: '#B2C7CD',
    300: '#86A3AC',
    400: '#62828C',
    500: '#4A6670', // brand (5.7:1 on paper)
    600: '#3D555E',
    700: '#31454C',
    800: '#25353A',
    900: '#1A2529',
  },
  // Highlights, memories, resurfaced content. Brand: gold.400 #C99A44
  gold: {
    50: '#FBF5E9',
    100: '#F4E6C8',
    200: '#E9CD93',
    300: '#DDB468',
    400: '#C99A44', // brand
    500: '#AE8033',
    600: '#8C6628',
    700: '#6B4E1F', // gold text on paper
    800: '#4B3716',
    900: '#2E220E',
  },
  // Growth & wellbeing. Brand: sage.400 #7C8B6F
  sage: {
    50: '#F1F3EE',
    100: '#DFE4DA',
    200: '#C2CBB8',
    300: '#A1AE94',
    400: '#7C8B6F', // brand
    500: '#66745A',
    600: '#525E49',
    700: '#3F4838',
    800: '#2D3328',
    900: '#1C2019',
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
  // Warm serif for hero / emotional / memory moments — used deliberately.
  display: 'Fraunces',
  // Humanist sans for UI and body.
  sans: 'Work Sans',
};

/** Type scale in px (line-height in px). */
const type = {
  hero: [44, 48],
  title: [30, 36],
  heading: [22, 28],
  lead: [18, 27],
  body: [16, 24],
  small: [14, 20],
  micro: [12, 16],
};

/**
 * Radii are deliberately varied per surface rather than one radius everywhere.
 */
const radii = {
  hair: 4,
  control: 12, // inputs, buttons
  sheet: 20, // paper sheets
  bubble: 22, // chat bubbles (tail corner overrides to `hair`)
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

module.exports = { colors, partner, modules, fonts, type, radii, motion };
