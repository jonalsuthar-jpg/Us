import { DECKS, deckById, type DeckId } from '@us/shared';
import type { useCallCards } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight, Layers, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FlipInYLeft, FlipOutYRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../ui/cn';
import { Display, Text } from '../ui/text';

type Cards = ReturnType<typeof useCallCards>;

/**
 * Talk cards over the call: pick a deck, and the same card shows on both
 * screens. Either of us can deal the next one.
 */
export function CallCards({ cards, picking, onPicking, partnerName }: { cards: Cards; picking: boolean; onPicking: (on: boolean) => void; partnerName: string }) {
  const insets = useSafeAreaInsets();
  const [spicy, setSpicy] = useState(false);
  const { table, card } = cards;
  if (!table && !picking) return null;

  const choose = (id: DeckId) => {
    void Haptics.selectionAsync().catch(() => {});
    onPicking(false);
    cards.open(id);
  };
  const deck = table ? deckById(table.deck) : null;

  return (
    <Animated.View entering={FadeInDown.duration(220)} className="absolute inset-x-4 rounded-[26px] bg-paper-raised p-4" style={{ top: insets.top + 64, elevation: 16 }}>
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Layers size={16} color="#6B5A7B" />
          <Text className="font-sans-semibold text-small text-ink-soft">{deck ? `${deck.emoji} ${deck.title}` : 'Pick a deck'}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          {table ? (
            <Pressable accessibilityRole="button" onPress={() => onPicking(true)} className="rounded-full px-2.5 py-1 active:bg-rose-50">
              <Text className="font-sans-semibold text-micro text-rose-600">Change deck</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Put the cards away"
            hitSlop={8}
            onPress={() => {
              onPicking(false);
              cards.close();
            }}
            className="h-8 w-8 items-center justify-center rounded-full active:bg-paper-sunken"
          >
            <X size={16} color="#6B5A7B" />
          </Pressable>
        </View>
      </View>

      {picking || !table ? (
        <View className="gap-2.5">
          <View className="flex-row flex-wrap justify-between gap-y-2">
            {DECKS.filter((d) => !d.spicy || spicy).map((d) => (
              <Pressable
                key={d.id}
                accessibilityRole="button"
                onPress={() => choose(d.id)}
                className={cn('w-[48.5%] rounded-[18px] border-2 px-3 py-3', table?.deck === d.id ? 'border-rose-300 bg-rose-50' : 'border-paper-edge active:border-rose-300')}
              >
                <Text className="text-[24px] leading-[30px]">{d.emoji}</Text>
                <Text className="mt-1 font-sans-semibold text-small text-ink">{d.title}</Text>
              </Pressable>
            ))}
          </View>
          {!spicy ? (
            <Pressable accessibilityRole="button" onPress={() => setSpicy(true)}>
              <Text className="text-micro text-ink-muted underline">Show the spicy deck 🌶️</Text>
            </Pressable>
          ) : null}
          <Text className="text-micro text-ink-muted">{`${partnerName} sees the same card as you.`}</Text>
        </View>
      ) : (
        <>
          <Animated.View
            key={`${table.deck}-${table.seed}-${table.index}`}
            entering={FlipInYLeft.duration(260)}
            exiting={FlipOutYRight.duration(180)}
            className="min-h-[120px] items-center justify-center rounded-[20px] bg-rose-50 px-5 py-6"
            accessibilityLiveRegion="polite"
          >
            <Display className="text-center text-[20px] leading-[27px]">{card ?? 'That’s the whole deck. Pick another?'}</Display>
          </Animated.View>
          <View className="mt-3 flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous card"
              disabled={!table.index}
              onPress={cards.back}
              className={cn('h-10 w-10 items-center justify-center rounded-full active:bg-paper-sunken', !table.index && 'opacity-30')}
            >
              <ChevronLeft size={20} color="#6B5A7B" />
            </Pressable>
            <Text className="text-micro text-ink-muted">{`${Math.min(table.index + 1, deck!.cards.length)} / ${deck!.cards.length}`}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                if (card) cards.next();
                else onPicking(true);
              }}
              className="h-10 flex-row items-center gap-1 rounded-full bg-rose-600 px-4 active:bg-rose-700"
            >
              <Text className="font-sans-semibold text-small text-white">{card ? 'Next' : 'New deck'}</Text>
              <ChevronRight size={16} color="#fff" />
            </Pressable>
          </View>
        </>
      )}
    </Animated.View>
  );
}
