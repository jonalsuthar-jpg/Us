import type { Metadata, Viewport } from 'next';
import { Fraunces, Work_Sans } from 'next/font/google';
import { MotionConfig } from '@/components/app/motion-config';
import { ThemeWatcher } from '@/components/app/theme-watcher';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  axes: ['SOFT', 'WONK', 'opsz'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const sans = Work_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Us', template: '%s · Us' },
  description: 'A private space for the two of you.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FCFAFB' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0A11' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by THEME_SCRIPT before React hydrates, hence the warning suppression.
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeWatcher />
        <MotionConfig>{children}</MotionConfig>
      </body>
    </html>
  );
}
