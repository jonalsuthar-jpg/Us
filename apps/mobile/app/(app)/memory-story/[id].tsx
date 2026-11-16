import { useLocalSearchParams } from 'expo-router';
import { BirthdayStoryScreen } from '@/components/birthday/birthday-room';

export default function StoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BirthdayStoryScreen memoryId={id} />;
}
