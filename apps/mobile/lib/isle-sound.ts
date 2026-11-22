import type { IsleLoop, IsleShot, IsleSound } from '@us/shared/isle';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/** The sounds, bundled with the app (scripts/generate-isle-sounds.mjs). */
const FILES: Record<IsleShot | IsleLoop, number> = {
  dice: require('../assets/isle/dice.wav'),
  town: require('../assets/isle/town.wav'),
  road: require('../assets/isle/road.wav'),
  city: require('../assets/isle/city.wav'),
  click: require('../assets/isle/click.wav'),
  card: require('../assets/isle/card.wav'),
  steal: require('../assets/isle/steal.wav'),
  gain: require('../assets/isle/gain.wav'),
  trade: require('../assets/isle/trade.wav'),
  robber: require('../assets/isle/robber.wav'),
  knight: require('../assets/isle/knight.wav'),
  seven: require('../assets/isle/seven.wav'),
  turn: require('../assets/isle/turn.wav'),
  bonus: require('../assets/isle/bonus.wav'),
  win: require('../assets/isle/win.wav'),
  waves: require('../assets/isle/waves.wav'),
  music: require('../assets/isle/music.wav'),
};

/**
 * Isle's sounds on the phone (expo-audio). Knocks and clicks get a couple of
 * players each so they can overlap; loops keep one player and change its
 * volume.
 */
export function phoneIsleSound(): IsleSound {
  let master = 1;
  const shots = new Map<IsleShot, { players: AudioPlayer[]; next: number }>();
  const loops = new Map<IsleLoop, { player: AudioPlayer; volume: number; playing: boolean }>();
  const all: AudioPlayer[] = [];
  // Gone: the table closed. A late call must not make a player nobody will stop.
  let gone = false;

  const shot = (name: IsleShot) => {
    let s = shots.get(name);
    if (!s) {
      const n = name === 'town' || name === 'road' || name === 'click' || name === 'card' ? 2 : 1;
      s = { players: Array.from({ length: n }, () => createAudioPlayer(FILES[name])), next: 0 };
      all.push(...s.players);
      shots.set(name, s);
    }
    return s;
  };

  return {
    play(name, volume) {
      if (gone || volume * master <= 0.01) return;
      try {
        const s = shot(name);
        const p = s.players[s.next]!;
        s.next = (s.next + 1) % s.players.length;
        p.volume = Math.min(1, volume * master);
        void p.seekTo(0);
        p.play();
      } catch {
        // A sound that won't play isn't worth stopping the game for.
      }
    },
    loop(name, volume) {
      if (gone) return;
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
          const player = createAudioPlayer(FILES[name]);
          player.loop = true;
          all.push(player);
          l = { player, volume: 0, playing: false };
          loops.set(name, l);
        }
        l.player.volume = Math.min(1, volume * master);
        l.volume = volume;
        if (!l.playing) {
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
      gone = true;
      for (const p of all) {
        try {
          p.pause();
          p.remove();
        } catch {
          // Already gone.
        }
      }
      all.length = 0;
    },
  };
}
