import { useCallManager, useCallState, useCouple } from '@us/shared/react';
import { Headphones, Laptop, Music, Smartphone, Tv } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { Display, Text } from '../ui/text';
import { Record, SoundBars } from './vinyl';

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
          className="h-[210px] flex-1 justify-end gap-1 overflow-hidden rounded-[24px] bg-plum-800 p-4 active:opacity-90"
        >
          <View pointerEvents="none" className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-rose-400/85" />
          <View pointerEvents="none" className="absolute right-3 top-3">
            <Record playing size={92} />
          </View>
          <View className="absolute left-4 top-4 h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Headphones size={18} color="#FCFAFB" />
          </View>
          <Display className="text-[19px] leading-[22px] text-paper">Listen together</Display>
          <Text className="text-micro text-plum-200">{`Hear what ${name} is playing`}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Watch together. Watch ${name}'s screen`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => setAsk('watch')}
          className="h-[210px] flex-1 justify-end gap-1 overflow-hidden rounded-[24px] bg-teal-900 p-4 active:opacity-90"
        >
          <View pointerEvents="none" className="absolute -bottom-16 -right-10 h-36 w-36 rounded-full bg-teal-500/80" />
          <View pointerEvents="none" className="absolute right-3 top-4 h-16 w-[100px] overflow-hidden rounded-[10px] border-4 border-plum-900 bg-plum-700">
            <View className="absolute -bottom-6 -left-4 h-14 w-20 rounded-full bg-gold-400/80" />
          </View>
          <View className="absolute left-4 top-4 h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Tv size={18} color="#FCFAFB" />
          </View>
          <Display className="text-[19px] leading-[22px] text-paper">Watch together</Display>
          <Text className="text-micro text-teal-200">{`Watch ${name}’s screen`}</Text>
        </Pressable>
      </View>
      <Text className="px-0.5 text-micro text-ink-muted">
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
