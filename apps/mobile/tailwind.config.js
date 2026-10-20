/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset'), require('@us/shared/tailwind-preset')],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // React Native picks a font file per family, so each weight/style is a family.
      fontFamily: {
        display: ['Fraunces_400Regular'],
        'display-light': ['Fraunces_300Light'],
        'display-italic': ['Fraunces_400Regular_Italic'],
        'display-light-italic': ['Fraunces_300Light_Italic'],
        sans: ['WorkSans_400Regular'],
        'sans-medium': ['WorkSans_500Medium'],
        'sans-semibold': ['WorkSans_600SemiBold'],
      },
    },
  },
  plugins: [],
};
