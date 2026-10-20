'use client';

import { useEffect } from 'react';
import { Home } from '@/components/home/home';

export default function HomePage() {
  useEffect(() => {
    document.title = 'Us';
  }, []);
  return <Home />;
}
