/**
 * Shared Tailwind preset — consumed by apps/web (Tailwind) and apps/mobile
 * (NativeWind) so both platforms speak the same design vocabulary.
 * Font families are mapped per platform in each app's tailwind.config.
 */
const { colors, type, radii, motion } = require('./src/tokens.js');

const px = (n) => `${n}px`;
const bezier = (p) => `cubic-bezier(${p.join(',')})`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        ...colors,
        ink: { DEFAULT: colors.plum[800], soft: colors.plum[500], muted: colors.plum[400] },
        // Semantic partner colours (A = rose, B = teal)
        partnerA: { DEFAULT: colors.rose[400], strong: colors.rose[600], wash: colors.rose[50] },
        partnerB: { DEFAULT: colors.teal[500], strong: colors.teal[700], wash: colors.teal[50] },
      },
      fontSize: Object.fromEntries(
        Object.entries(type).map(([k, [size, lh]]) => [k, [px(size), { lineHeight: px(lh) }]]),
      ),
      borderRadius: {
        hair: px(radii.hair),
        control: px(radii.control),
        sheet: px(radii.sheet),
        bubble: px(radii.bubble),
      },
      transitionDuration: Object.fromEntries(
        Object.entries(motion.duration).map(([k, v]) => [k, `${v}ms`]),
      ),
      transitionTimingFunction: Object.fromEntries(
        Object.entries(motion.ease).map(([k, v]) => [k, bezier(v)]),
      ),
    },
  },
};
