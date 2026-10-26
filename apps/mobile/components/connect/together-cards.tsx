import { useCallManager, useCallState, useCouple } from '@us/shared/react';
import { Headphones, Laptop, Music, Play, Smartphone, Tv } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { Display, Text } from '../ui/text';
import { Record, SoundBars } from './vinyl';

// A soft, deep shadow, like Home's photo card (Android draws it from elevation).
const TILE_SHADOW = { elevation: 8, shadowColor: '#170F21', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 12 } } as const;

/**
 * Listen together and Watch together on a phone. Phones can't capture
 * another app's sound or the screen, so here I ask my partner to share from
 * their computer, and listen or watch along.
 */
export function TogetherCards() {
  const m = useCallManager();
  const call = useCallState();
  const { partner, partnerOnline } = useCouple();
  const [ask, setAsk] = useState<'listen' | 'watch' | null>(null);
  const busy = call.phase !== 'idle' && call.phase !== 'ended';
  const name = partner.display_name;

  return (
    <View className="gap-2">
      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Listen together. Hear what ${name} plays`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => setAsk('listen')}
          style={TILE_SHADOW}
          className="h-[220px] flex-1 justify-between overflow-hidden rounded-[26px] bg-plum-800 p-4 active:opacity-90"
        >
          <View pointerEvents="none" className="absolute -right-12 -top-14 h-40 w-40 rounded-full bg-rose-400 opacity-90" />
          <View pointerEvents="none" className="absolute -right-3 top-3">
            <Record playing size={104} />
          </View>
          <View className="flex-row items-center gap-2">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
              <Headphones size={19} color="#FCFAFB" />
            </View>
          </View>
          <View className="gap-1">
            <SoundBars playing count={4} height={14} className="mb-1" />
            <Display className="text-[20px] leading-[23px] text-paper">Listen together</Display>
            <Text className="text-micro leading-[17px] text-plum-200">{`Hear what ${name} is playing`}</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Watch together. Watch ${name}'s screen`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => setAsk('watch')}
          style={TILE_SHADOW}
          className="h-[220px] flex-1 justify-between overflow-hidden rounded-[26px] bg-teal-900 p-4 active:opacity-90"
        >
          <View pointerEvents="none" className="absolute -bottom-16 -right-12 h-40 w-40 rounded-full bg-teal-500 opacity-80" />
          <View pointerEvents="none" className="absolute right-3 top-4 h-[66px] w-[96px] items-center justify-center overflow-hidden rounded-xl border-4 border-plum-900 bg-plum-700">
            <View className="absolute -bottom-6 -left-4 h-14 w-20 rounded-full bg-gold-400 opacity-80" />
            <View className="h-7 w-7 items-center justify-center rounded-full bg-paper">
              <Play size={12} color="#241933" fill="#241933" style={{ marginLeft: 2 }} />
            </View>
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
            <Tv size={19} color="#FCFAFB" />
          </View>
          <View className="gap-1">
            <Display className="text-[20px] leading-[23px] text-paper">Watch together</Display>
            <Text className="text-micro leading-[17px] text-teal-200">{`Watch ${name}’s screen`}</Text>
          </View>
        </Pressable>
      </View>
      <Text className="px-1 text-micro leading-[18px] text-ink-muted">
        {busy ? 'You’re on a call. Finish it to start something new.' : `Sharing starts from a computer. From here you ask ${name} to share, and listen or watch on your phone.`}
      </Text>

      <FormSheet open={ask !== null} onClose={() => setAsk(null)} title={ask === 'watch' ? 'Watch together' : 'Listen together'} centered>
        <View className="flex-row items-center justify-center gap-5 overflow-hidden rounded-sheet bg-plum-800 py-7">
          <View className="items-center gap-1.5">
            <Laptop size={44} color="#FCFAFB" strokeWidth={1.5} />
            <Text className="text-micro text-plum-200">{`${name}’s computer`}</Text>
          </View>
          <SoundBars playing count={3} height={16} />
          <View className="items-center gap-1.5">
            <Smartphone size={44} color="#FCFAFB" strokeWidth={1.5} />
            <Text className="text-micro text-plum-200">Your phone</Text>
          </View>
        </View>
        <Text className="text-body text-ink-soft">
          {ask === 'watch'
            ? `Screens are shared from a computer. ${name} gets a ring with a button to share theirs, and you watch here.`
            : `The music plays from a computer, where Us can hear what’s playing. ${name} gets a ring with a button to share it, and you hear exactly what they hear.`}
        </Text>
        <View className={cn('flex-row items-center gap-2.5 rounded-control px-3.5 py-3', partnerOnline ? 'bg-sage-50' : 'bg-paper-sunken')}>
          <View className={cn('h-2 w-2 rounded-full', partnerOnline ? 'bg-sage-400' : 'bg-plum-200')} />
          <Text className={cn('flex-1 text-small', partnerOnline ? 'text-sage-700' : 'text-ink-soft')}>
            {partnerOnline ? `${name} has Us open right now.` : `${name} isn’t in Us right now. They’ll get a notification.`}
          </Text>
        </View>
        <Button
          size="lg"
          icon={ask === 'watch' ? <Tv size={20} color="#fff" /> : <Music size={20} color="#fff" />}
          onPress={() => {
            const what = ask;
            setAsk(null);
            if (what) void m.startSession(what);
          }}
        >
          {ask === 'watch' ? `Ask ${name} to share their screen` : `Ask ${name} to play something`}
        </Button>
        <Text className="text-center text-micro text-ink-muted">
          {ask === 'watch' ? 'Your mic is on, your camera stays off.' : 'Your mic starts muted. Tap it any time to talk over the music.'}
        </Text>
      </FormSheet>
    </View>
  );
}
