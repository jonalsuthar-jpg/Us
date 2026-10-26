import { useCouple, useDailyDoodle, useDrawGames, useDrawings, usePartnerDrawing } from '@us/shared/react';
import { router } from 'expo-router';
import { MessageCircleQuestion, PenLine, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { CoupleDoodle } from './art';
import { DoodleSheet } from './doodle-sheet';

/** Draw together and Draw & Guess, two-up under Listen and Watch. */
export function DrawTiles() {
  const { partner, partnerOnline } = useCouple();
  const drawing = usePartnerDrawing();
  const { stats, toGuess, myTurnToDraw } = useDrawGames();
  const name = partner.display_name;
  const guessLine = toGuess ? 'Your turn to guess' : myTurnToDraw ? 'Your turn to draw' : stats.best ? `Best team score ${stats.best}` : 'Six rounds, one team';

  return (
    <View className="flex-row gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Draw together. ${drawing ? `${name} is drawing` : 'One canvas, live'}`}
        onPress={() => router.push('/draw')}
        className="h-[200px] flex-1 justify-between overflow-hidden rounded-[26px] border border-rose-100 bg-rose-50 p-4 active:opacity-90"
      >
        <View pointerEvents="none" className="absolute -right-[18px] -top-[14px]" style={{ transform: [{ rotate: '6deg' }] }}>
          <CoupleDoodle width={120} />
        </View>
        <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-rose-400">
          <PenLine size={19} color="#fff" />
        </View>
        <View className="gap-1">
          {drawing || partnerOnline ? (
            <View className="flex-row items-center gap-1.5">
              <View className="h-[7px] w-[7px] rounded-full bg-sage-400" />
              <Text className="font-sans-semibold text-[12px] leading-[15px] text-sage-700" numberOfLines={1}>
                {drawing ? `${name} is drawing` : `${name} is online`}
              </Text>
            </View>
          ) : null}
          <Display className="text-[19px] leading-[23px]" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            Draw together
          </Display>
          <Text className="text-micro leading-[17px] text-ink-soft">One canvas, live</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Draw and Guess. ${guessLine}`}
        onPress={() => router.push('/draw/guess')}
        className="h-[200px] flex-1 justify-between overflow-hidden rounded-[26px] border border-gold-100 bg-gold-50 p-4 active:opacity-90"
      >
        <View pointerEvents="none" className="absolute right-3 top-3.5 flex-row gap-1">
          {['', 'a', ''].map((ch, i) => (
            <View key={i} className="h-6 w-[18px] items-center border-b-[3px] border-gold-700">
              <Text className="font-sans-bold text-[18px] leading-[22px] text-gold-700">{ch}</Text>
            </View>
          ))}
        </View>
        <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-gold-400">
          <MessageCircleQuestion size={19} color="#352203" />
        </View>
        <View className="gap-1">
          <Text className="font-sans-semibold text-[12px] leading-[15px] text-gold-700" numberOfLines={1}>
            {guessLine}
          </Text>
          <Display className="text-[19px] leading-[23px]" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            Draw & Guess
          </Display>
          <Text className="text-micro leading-[17px] text-ink-soft" numberOfLines={1}>
            {stats.played ? `${stats.played} ${stats.played === 1 ? 'game' : 'games'} played` : 'Hinglish & your words'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/** "Our drawings" with a "Leave a doodle" tile at the end. */
export function DrawingsStrip() {
  const { partner } = useCouple();
  const c = usePalette();
  const { drawings, urls } = useDrawings();
  const [doodle, setDoodle] = useState(false);
  const shown = drawings.filter((d) => d.kind !== 'guess' || d.answered_at).slice(0, 6);

  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline justify-between">
        <Display className="text-heading">Our drawings</Display>
        {drawings.length ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/draw/gallery')} hitSlop={8}>
            <Text className="font-sans-semibold text-small text-rose-600">{`See all ${drawings.length}`}</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5">
        {shown.map((d) => (
          <Pressable
            key={d.id}
            accessibilityRole="button"
            accessibilityLabel={d.title ?? 'A drawing'}
            onPress={() => router.push({ pathname: '/draw/[id]', params: { id: d.id } })}
            className="h-[120px] w-[90px] overflow-hidden rounded-[14px] border border-paper-edge bg-white"
          >
            {urls[d.png_path] ? <Image source={{ uri: urls[d.png_path] }} style={{ width: 90, height: 120 }} /> : null}
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Leave ${partner.display_name} a doodle`}
          onPress={() => setDoodle(true)}
          className="h-[120px] w-[90px] items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-rose-300"
        >
          <Plus size={22} color={c.onRose} />
          <Text className="text-center font-sans-semibold text-micro leading-[16px] text-rose-600">{'Leave a\ndoodle'}</Text>
        </Pressable>
      </ScrollView>
      <DoodleSheet open={doodle} onClose={() => setDoodle(false)} />
    </View>
  );
}

/** Today's doodle prompt, revealed when we've both drawn it. */
export function DailyDoodleCard() {
  const { partner } = useCouple();
  const daily = useDailyDoodle();
  const name = partner.display_name;
  const line =
    daily.mine && daily.partner
      ? 'You both drew it. Tap to see them side by side.'
      : daily.mine
        ? `Yours is in. ${name}’s shows here when they draw theirs.`
        : daily.partner
          ? `${name} drew theirs. Draw yours to see it.`
          : `Draw it, then see ${name}’s.`;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/draw/daily')} className="gap-1 rounded-[20px] bg-paper-sunken px-4 py-3.5 active:opacity-80">
      <Text className="font-sans-semibold text-body">{`Today’s doodle: “${daily.prompt}”`}</Text>
      <Text className="text-small text-ink-soft">{line}</Text>
    </Pressable>
  );
}
