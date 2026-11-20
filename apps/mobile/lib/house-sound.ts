import type { HouseSound, Loop, OneShot } from '@us/shared/house';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/**
 * Our House's sounds on the phone (expo-audio), from the downloaded house
 * pack. Footsteps get a few players each so they can overlap; loops keep one
 * player and change its volume.
 */
export function phoneHouseSound(dir: string): HouseSound {
  let master = 1;
  const make = (name: string) => createAudioPlayer({ uri: `${dir}/sounds/${name}.wav` });
  const shots = new Map<OneShot, { players: AudioPlayer[]; next: number }>();
  const loops = new Map<Loop, { player: AudioPlayer; volume: number; playing: boolean }>();
  const all: AudioPlayer[] = [];

  const shot = (name: OneShot) => {
    let s = shots.get(name);
    if (!s) {
      const n = name.startsWith('step_') ? 3 : 1;
      s = { players: Array.from({ length: n }, () => make(name)), next: 0 };
      all.push(...s.players);
      shots.set(name, s);
    }
    return s;
  };

  return {
    play(name, volume) {
      if (volume * master <= 0.01) return;
      try {
        const s = shot(name);
        const p = s.players[s.next]!;
        s.next = (s.next + 1) % s.players.length;
        p.volume = Math.min(1, volume * master);
        void p.seekTo(0);
        p.play();
      } catch {
        // A sound that won't play isn't worth stopping the house for.
      }
    },
    loop(name, volume, offset = 0) {
      try {
        let l = loops.get(name);
        if (volume <= 0.005) {
          if (l?.playing) {
            l.player.pause();
            l.playing = false;
          }
          return;
        }
        if (!l) {
          const player = make(name);
          player.loop = true;
          all.push(player);
          l = { player, volume: 0, playing: false };
          loops.set(name, l);
        }
        if (Math.abs(l.volume - volume) > 0.02) {
          l.player.volume = Math.min(1, volume * master);
          l.volume = volume;
        }
        if (!l.playing) {
          void l.player.seekTo(offset);
          l.player.play();
          l.playing = true;
        }
      } catch {
        // As above.
      }
    },
    setMaster(volume) {
      master = volume;
      for (const l of loops.values()) l.player.volume = Math.min(1, l.volume * master);
    },
    dispose() {
      for (const p of all) {
        try {
          p.remove();
        } catch {
          // Already gone.
        }
      }
      all.length = 0;
    },
  };
}
