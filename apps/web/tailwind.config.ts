import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
const preset = require('@us/shared/tailwind-preset');
const { themeVars } = require('@us/shared/theme');

const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  // lib/theme.ts sets data-theme on <html> (from the saved choice or the OS).
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        // CSS variables come from next/font in app/layout.tsx
        // Headings and names: Inter, bold (see globals.css). The serif is opt-in.
        display: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        breathe: {
          '0%': { transform: 'scale(0.9)', opacity: '0.55' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        'typing-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.45' },
          '30%': { transform: 'translateY(-3px)', opacity: '1' },
        },
      },
      animation: {
        breathe: 'breathe 2.4s cubic-bezier(0.22,1,0.36,1) infinite',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [
    // The --us-* colour variables behind paper, ink and the washes.
    plugin(({ addBase }) =>
      addBase({
        ':root': { ...themeVars('light'), colorScheme: 'light' },
        ':root[data-theme="dark"]': { ...themeVars('dark'), colorScheme: 'dark' },
      }),
    ),
  ],
};

export default config;
