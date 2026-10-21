/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset'), require('@us/shared/tailwind-preset')],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // React Native picks a font file per family, so each weight/style is a family.
      fontFamily: {
        // Headings and names: Inter Bold, for clarity. The serif stays only for
        // deliberate warm moments (light / italic), e.g. memories and empty states.
        display: ['Inter_700Bold'],
        'display-light': ['Fraunces_300Light'],
        'display-italic': ['Fraunces_400Regular_Italic'],
        'display-light-italic': ['Fraunces_300Light_Italic'],
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
      },
    },
  },
  plugins: [],
};
