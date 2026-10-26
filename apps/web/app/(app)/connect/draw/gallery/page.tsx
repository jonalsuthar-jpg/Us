'use client';

import { useFeature } from '@us/shared/react';
import { Suspense } from 'react';
import { FeatureOff } from '@/components/app/feature-off';
import { Gallery } from '@/components/draw/gallery';

export default function GalleryPage() {
  const on = useFeature('draw');
  if (!on) return <FeatureOff />;
  return (
    <Suspense>
      <Gallery />
    </Suspense>
  );
}
