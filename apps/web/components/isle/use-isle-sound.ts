import type { IsleSound } from '@us/shared/isle';
import { useEffect, useState } from 'react';
import { webIsleSound } from '@/lib/isle-sound';

const MUTED = 'us.isle.muted';
const MUSIC = 'us.isle.music';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Remembering is a nicety; the switch still works for this visit.
  }
}

/** Isle's sounds for this visit, with the sound and music switches remembered on this browser. */
export function useIsleSound() {
  const [sound, setSound] = useState<IsleSound | null>(null);
  const [muted, setMuted] = useState(false);
  const [music, setMusic] = useState(true);
  useEffect(() => {
    setMuted(read(MUTED) === '1');
    setMusic(read(MUSIC) !== '0');
    const s = webIsleSound();
    setSound(s);
    return () => s.dispose();
  }, []);
  return {
    sound,
    muted,
    music,
    onToggleSound: () =>
      setMuted((m) => {
        write(MUTED, m ? '0' : '1');
        return !m;
      }),
    onToggleMusic: () =>
      setMusic((m) => {
        write(MUSIC, m ? '0' : '1');
        return !m;
      }),
  };
}
