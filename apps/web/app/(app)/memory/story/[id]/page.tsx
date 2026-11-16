'use client';

import { use } from 'react';
import { BirthdayStoryPage } from '@/components/birthday/birthday-room';

export default function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BirthdayStoryPage memoryId={id} />;
}
