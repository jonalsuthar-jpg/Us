'use client';

import { useEffect } from 'react';
import { watchSystemTheme } from '@/lib/theme';

/** Keeps the page in step with the OS theme while the preference is "system". */
export function ThemeWatcher() {
  useEffect(() => watchSystemTheme(), []);
  return null;
}
