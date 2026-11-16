import { useCouple, useDailyDoodle, useDrawGames, useDrawings, usePartnerDrawing } from '@us/shared/react';
import { router } from 'expo-router';
import { Clock, Lock, MessageCircleQuestion, PenLine, Plus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { CoupleDoodle } from './art';
import { DoodleSheet } from './doodle-sheet';

/** Draw together and Draw & Guess, two-up. */
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
        className="h-[176px] flex-1 justify-between overflow-hidden rounded-[24px] border border-rose-100 bg-rose-50 p-4 active:opacity-90"
      >
        <View pointerEvents="none" className="absolute -right-[18px] -top-[14px]" style={{ transform: [{ rotate: '6deg' }] }}>
          <CoupleDoodle width={105} />
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
        className="h-[176px] flex-1 justify-between overflow-hidden rounded-[24px] border border-gold-100 bg-gold-50 p-4 active:opacity-90"
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

/** "Our drawings": a "Leave a doodle" tile first, then the latest drawings. */
export function DrawingsStrip() {
  const { partner } = useCouple();
  const { drawings, urls } = useDrawings();
  const [doodle, setDoodle] = useState(false);
  const shown = drawings.filter((d) => d.kind !== 'guess' || d.answered_at).slice(0, 6);

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Display className="text-heading">Our drawings</Display>
        {drawings.length ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/draw/gallery')} hitSlop={8}>
            <Text className="font-sans-semibold text-small text-rose-600">{`See all ${drawings.length}`}</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Leave ${partner.display_name} a doodle`}
          onPress={() => setDoodle(true)}
          className="h-[112px] w-[84px] items-center justify-center gap-1.5 rounded-[16px] border-2 border-dashed border-rose-300 bg-rose-50 active:opacity-80"
        >
          <View className="h-8 w-8 items-center justify-center rounded-full bg-rose-400">
            <Plus size={17} color="#fff" />
          </View>
          <Text className="text-center font-sans-bold text-micro leading-[15px] text-rose-700">{'Leave a\ndoodle'}</Text>
        </Pressable>
        {shown.map((d) => (
          <Pressable
            key={d.id}
            accessibilityRole="button"
            accessibilityLabel={d.title ?? 'A drawing'}
            onPress={() => router.push({ pathname: '/draw/[id]', params: { id: d.id } })}
            className="h-[112px] w-[84px] overflow-hidden rounded-[16px] border border-paper-edge bg-white"
          >
            {urls[d.png_path] ? <Image source={{ uri: urls[d.png_path] }} style={{ width: 84, height: 112 }} /> : null}
          </Pressable>
        ))}
        {!shown.length ? (
          <Display light italic className="px-2 text-small text-ink-soft">
            Your doodles collect here.
          </Display>
        ) : null}
      </ScrollView>
      <DoodleSheet open={doodle} onClose={() => setDoodle(false)} />
    </View>
  );
}

/** Today's doodle prompt: my frame and theirs. Theirs stays hidden until I've drawn mine. */
export function DailyDoodleCard() {
  const { me, partner } = useCouple();
  const c = usePalette();
  const daily = useDailyDoodle();
  const name = partner.display_name;
  const mine = daily.drawings.find((d) => d.created_by === me.id);
  const theirs = daily.drawings.find((d) => d.created_by !== me.id);
  const waiting = daily.mine && !daily.partner;
  const cta = daily.mine && daily.partner ? 'See side by side' : waiting ? `Waiting for ${name}` : 'Draw it';
  const open = () => router.push('/draw/daily');

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Display className="text-heading">Today’s doodle</Display>
        <Text className="font-sans-semibold text-micro text-ink-muted">New prompt every day</Text>
      </View>
      <View className="gap-4 rounded-[26px] border border-rose-100 bg-rose-50 p-4">
        <View className="gap-1">
          <Text className="font-sans-bold text-micro text-rose-700">Draw it, then see theirs</Text>
          <Display light className="text-[26px] leading-[32px]">{`“${daily.prompt}”`}</Display>
        </View>
        <View className="flex-row gap-2.5">
          <DoodleFrame who="You" dot="bg-rose-400">
            {daily.mine ? (
              <Thumb url={mine ? daily.urls[mine.png_path] : undefined} />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={open}
                className="flex-1 items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-rose-300 bg-paper-raised active:opacity-80"
              >
                <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-rose-400">
                  <PenLine size={19} color="#fff" />
                </View>
                <Text className="font-sans-bold text-small text-rose-700">Draw yours</Text>
              </Pressable>
            )}
          </DoodleFrame>
          <DoodleFrame who={name} dot="bg-teal-500">
            {daily.partner && daily.mine ? (
              <Thumb url={theirs ? daily.urls[theirs.png_path] : undefined} />
            ) : daily.partner ? (
              <View className="flex-1 items-center justify-center overflow-hidden rounded-[18px] border border-paper-edge bg-white">
                <View className="absolute opacity-15">
                  <CoupleDoodle width={90} />
                </View>
                <View className="items-center gap-1.5 p-2">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-teal-600">
                    <Lock size={16} color="#fff" />
                  </View>
                  <Text className="text-center font-sans-bold text-micro text-teal-700">{'Drawn · draw\nyours to see'}</Text>
                </View>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center gap-2 rounded-[18px] border border-paper-edge bg-paper-raised">
                <Clock size={20} color={c.inkMuted} />
                <Text className="px-2 text-center font-sans-semibold text-micro text-ink-muted">{`Waiting for ${name}`}</Text>
              </View>
            )}
          </DoodleFrame>
        </View>
        {waiting ? (
          <View className="h-12 items-center justify-center rounded-full border border-paper-edge bg-paper-raised">
            <Text className="font-sans-semibold text-small text-ink-muted">{cta}</Text>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={open} className="h-12 items-center justify-center rounded-full bg-rose-600 active:bg-rose-700">
            <Text className="font-sans-bold text-small text-white">{cta}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function DoodleFrame({ who, dot, children }: { who: string; dot: string; children: ReactNode }) {
  return (
    <View className="flex-1 gap-1.5">
      <View className="h-[168px]">{children}</View>
      <View className="flex-row items-center gap-1.5">
        <View className={`h-[7px] w-[7px] rounded-full ${dot}`} />
        <Text className="flex-1 font-sans-bold text-micro text-ink" numberOfLines={1}>
          {who}
        </Text>
      </View>
    </View>
  );
}

function Thumb({ url }: { url: string | undefined }) {
  return (
    <View className="flex-1 overflow-hidden rounded-[18px] border border-paper-edge bg-white">
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
    </View>
  );
}
