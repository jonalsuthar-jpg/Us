import { dailyState, daysUntil, formatEventTime, toDateKey, whenLabel, type HomeData } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { router } from 'expo-router';
import { ChevronRight, Mail, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useDaily } from '../connect/daily-question';
import { DinnerArt, GradientView } from '../plan/art';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';

const lift = { shadowColor: '#634882', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 4 };

/** The next plan, on a dark card with a candlelit table: the same look as Plan's "Next up". */
export function NextUpCard({ event }: { event: HomeData['nextEvent'] }) {
  const { me, partner } = useCouple();
  const at = event ? new Date(event.starts_at) : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/plan')}
      style={({ pressed }) => [{ borderRadius: 26, backgroundColor: '#4B3468', ...lift }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <GradientView from="#3A2A5E" to="#4B3468" radius={26} className="min-h-[104px] flex-row items-center gap-3.5 p-4">
        <View className="absolute bottom-0 right-0" pointerEvents="none">
          <DinnerArt width={130} height={72} />
        </View>
        {at && event ? (
          <>
            <View className="h-16 w-[58px] items-center justify-center rounded-[16px] bg-white/10">
              <Text className="font-sans-bold text-micro uppercase text-gold-300">{at.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
              <Text className="font-sans-bold text-[24px] leading-[28px] text-white">{at.getDate()}</Text>
            </View>
            <View className="flex-1 pr-16">
              <Text className="font-sans-bold text-micro text-gold-300" numberOfLines={1}>
                Next up · {whenLabel(daysUntil(toDateKey(at))).toLowerCase()}
              </Text>
              <Text className="font-sans-bold text-[18px] text-white" numberOfLines={1}>
                {event.title}
              </Text>
              <Text className="text-micro text-white/80" numberOfLines={1}>
                {formatEventTime(event)} · {event.created_by === me.id ? 'you planned it' : `${partner.display_name} planned it`}
              </Text>
            </View>
          </>
        ) : (
          <View className="flex-1 pr-20">
            <Text className="font-sans-bold text-micro text-gold-300">Next up</Text>
            <Text className="font-sans-bold text-[18px] text-white">Nothing planned yet</Text>
            <Text className="text-micro text-white/80">Plan a date, a trip, or a quiet night in.</Text>
          </View>
        )}
      </GradientView>
    </Pressable>
  );
}

/** A memory to look back on: its photo (or golden hills) with an "On this day" badge, the title under it. */
export function MemoryCard({ memory, photoUrl }: { memory: HomeData['memory']; photoUrl: string | null | undefined }) {
  const c = usePalette();
  // Drawn at the measured width: Android sizes a "100%" Svg too early.
  const [width, setWidth] = useState(0);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/memory')}
      style={({ pressed }) => [{ borderRadius: 26, backgroundColor: c.paperRaised, ...lift }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View className="overflow-hidden rounded-[26px] border border-paper-edge bg-paper-raised">
        <View className="h-[150px] overflow-hidden" style={{ backgroundColor: '#EE9C82' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
          ) : width ? (
            <Svg width={width} height={150} viewBox="0 0 354 150" preserveAspectRatio="xMidYMid slice">
              <Circle cx={80} cy={104} r={56} fill="#FFE4A8" opacity={0.5} />
              <Path d="M0 122 L90 76 L170 114 L260 66 L354 104 V150 H0Z" fill="#7A4B3A" opacity={0.35} />
              <Path d="M0 140 Q120 112 240 138 T354 132 V150 H0Z" fill="#7A4B3A" opacity={0.5} />
            </Svg>
          ) : null}
          <View className="absolute left-3 top-3 flex-row items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1">
            <Star size={13} color="#F3A823" fill="#F3A823" />
            <Text className="font-sans-bold text-micro text-gold-700">{memory?.yearsAgo ? `On this day · ${memory.yearsAgo} ${memory.yearsAgo === 1 ? 'year' : 'years'} ago` : 'A memory'}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-3 p-4">
          <View className="flex-1">
            <Text className="font-sans-bold text-[17px] leading-[22px]" numberOfLines={2}>
              {memory ? memory.title : 'Keep your first memory'}
            </Text>
            <Text className="text-small text-ink-soft">{memory ? 'Tap to relive it' : 'A photo, a line, the date — the start of your story.'}</Text>
          </View>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-paper-sunken">
            <ChevronRight size={16} color={c.inkMuted} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Today's question itself, in mint with an envelope, and what's next: answer it, wait, or read both. */
export function QuestionCard() {
  const c = usePalette();
  const daily = useDaily();
  const today = daily.data?.today;
  const state = today ? dailyState(today) : null;
  const action = state === 'revealed' ? 'Read' : state === 'waiting' ? 'Waiting' : 'Answer';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/connect')}
      style={({ pressed }) => [{ borderRadius: 26, backgroundColor: c.scheme === 'dark' ? '#19141D' : '#F1FCF9', ...lift }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <GradientView
        from={c.scheme === 'dark' ? '#0C2B28' : '#D8F5EE'}
        to={c.scheme === 'dark' ? '#19141D' : '#F1FCF9'}
        radius={26}
        className="flex-row items-center gap-3.5 border border-teal-100 p-4 dark:border-paper-edge"
      >
        <View className="h-[52px] w-[52px] items-center justify-center rounded-[17px] bg-teal-600">
          <Mail size={24} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="font-sans-bold text-micro text-teal-700">Connect · Today’s question</Text>
          <Display light className="text-[16px] leading-[21px]" numberOfLines={3}>
            {today?.prompt ?? 'One question a day. Your answers open once you’ve both replied.'}
          </Display>
        </View>
        <View className={cn('rounded-full px-3 py-2', action === 'Waiting' ? 'bg-paper-sunken' : 'bg-teal-600')}>
          <Text className={cn('font-sans-bold text-micro', action === 'Waiting' ? 'text-ink-muted' : 'text-white')}>{action}</Text>
        </View>
      </GradientView>
    </Pressable>
  );
}
