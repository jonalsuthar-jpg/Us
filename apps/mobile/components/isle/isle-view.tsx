import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsle, type IsleSound, type Seat } from '@us/shared/isle';
import { useCouple } from '@us/shared/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { phoneIsleSound } from '@/lib/isle-sound';
import { Text } from '../ui/text';
import { IsleTable } from './isle-table';

/** The two bots who make up the table. */
const BOTS: Seat[] = [
  { id: 'bot:meera', name: 'Meera', bot: true },
  { id: 'bot:kabir', name: 'Kabir', bot: true },
];

/**
 * Isle, as the two of us share it: straight onto the board. The first time
 * (or when nothing's being played) a fresh island is dealt at once. Loaded
 * only when the island opens (see app/(app)/isle.tsx).
 */
export function IsleView() {
  const { me, partner } = useCouple();
  const { store, snap } = useIsle();
  const [problem, setProblem] = useState<string | null>(null);
  const starting = useRef(false);
  // Sound: on unless turned off here (remembered on this phone); the tune can go on its own.
  const [sound, setSound] = useState<IsleSound | null>(null);
  const [muted, setMuted] = useState(false);
  const [music, setMusic] = useState(true);
  useEffect(() => {
    void AsyncStorage.multiGet(['us.isle.muted', 'us.isle.music'])
      .then((pairs) => {
        const saved = new Map(pairs);
        setMuted(saved.get('us.isle.muted') === '1');
        setMusic(saved.get('us.isle.music') !== '0');
      })
      .catch(() => {});
    const s = phoneIsleSound();
    setSound(s);
    return () => s.dispose();
  }, []);
  const flip = (key: string, set: (f: (v: boolean) => boolean) => void) =>
    set((v) => {
      void AsyncStorage.setItem(key, v ? '0' : '1').catch(() => {});
      return !v;
    });

  const start = () => {
    if (!store || starting.current) return;
    starting.current = true;
    store
      .start([
        { id: me.id, name: me.display_name || 'You', bot: false },
        { id: partner.id, name: partner.display_name || 'Partner', bot: false },
        ...BOTS,
      ])
      .catch(() => setProblem('Couldn’t deal a new island. Try again in a moment.'))
      .finally(() => (starting.current = false));
  };

  useEffect(() => {
    if (store && snap.loaded && !snap.game) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, snap.loaded, snap.game]);

  if (!store || !snap.game || snap.seat < 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-[#A9D8E8]">
        <ActivityIndicator color="#fff" size="large" />
        {problem ? <Text className="text-small text-white">{problem}</Text> : null}
      </View>
    );
  }
  return (
    <IsleTable
      sound={sound}
      muted={muted}
      music={music}
      onToggleSound={() => flip('us.isle.muted', setMuted)}
      onToggleMusic={() => flip('us.isle.music', setMusic)}
      state={snap.game.state}
      me={snap.seat}
      botThinking={snap.botThinking}
      onMove={(a) => store.move(snap.seat, a)}
      onNewGame={start}
      onExit={() => router.back()}
    />
  );
}
