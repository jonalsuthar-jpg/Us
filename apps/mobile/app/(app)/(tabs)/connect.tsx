import { moduleById, TOGETHER_SOON } from '@us/shared';
import { useFeature } from '@us/shared/react';
import { BookOpen, Gamepad2, PenLine } from 'lucide-react-native';
import { View } from 'react-native';
import { AnswersCard, DailyQuestion, useDaily } from '@/components/connect/daily-question';
import { TogetherCards } from '@/components/connect/together-cards';
import { FeatureOff } from '@/components/feature-off';
import { ModuleScreen, SectionTitle } from '@/components/module-screen';
import { cn } from '@/components/ui/cn';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';

const ACTIVITY = {
  draw: { Icon: PenLine, wash: 'bg-rose-50', fill: 'bg-rose-400', icon: '#fff', pill: 'text-rose-700' },
  games: { Icon: Gamepad2, wash: 'bg-gold-50', fill: 'bg-gold-400', icon: '#352203', pill: 'text-gold-700' },
  read: { Icon: BookOpen, wash: 'bg-sage-50', fill: 'bg-sage-500', icon: '#fff', pill: 'text-sage-700' },
};

// TODO(phase-3): Fight Translator, Future Letters, Inside Jokes. Tables and RLS are ready.
export default function Connect() {
  const daily = useDaily();
  const soon = moduleById('connect').features.filter((f) => f.soon);
  const on = useFeature('daily_question');
  const calls = useFeature('calls');

  return (
    <ModuleScreen id="connect" refreshing={daily.loading && !!daily.data} onRefresh={() => void daily.reload()}>
      {calls ? <TogetherCards /> : null}
      {on ? (
        <View className="gap-3">
          <DailyQuestion daily={daily} />
          <AnswersCard daily={daily} />
        </View>
      ) : calls ? null : (
        <FeatureOff />
      )}
      <View className="gap-3">
        <SectionTitle>More to do together</SectionTitle>
        {TOGETHER_SOON.map((a) => {
          const look = ACTIVITY[a.id];
          return (
            <View key={a.id} className={cn('flex-row items-center gap-3 rounded-[18px] p-3.5', look.wash)}>
              <View className={cn('h-11 w-11 items-center justify-center rounded-[14px]', look.fill)}>
                <look.Icon size={20} color={look.icon} />
              </View>
              <View className="flex-1">
                <Display className="text-body">{a.title}</Display>
                <Text className="text-micro text-ink-soft">{a.short}</Text>
              </View>
              <View className="rounded-full bg-paper-raised px-2.5 py-1">
                <Text className={cn('font-sans-semibold text-micro', look.pill)}>Soon</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View className="gap-3">
        <SectionTitle>Coming to Connect</SectionTitle>
        {soon.map((f) => (
          <Sheet key={f.title} tone="inset" pad="sm">
            <Display className="text-lead">{f.title}</Display>
            <Text className="mt-1 text-small text-ink-soft">{f.blurb}</Text>
          </Sheet>
        ))}
      </View>
    </ModuleScreen>
  );
}
