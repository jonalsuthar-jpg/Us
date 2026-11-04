import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BIRTHDAY_TOPIC,
  birthdayPhase,
  getBirthdayRoom,
  keepBirthday,
  markBirthdayQuiz,
  openBirthday,
  saveBirthdaySection,
  type BirthdayContent,
  type BirthdayRoom,
  type BirthdaySection,
} from '../api/birthday';
import { draftMessage, sendMessage } from '../api/messages';
import { notifyPartner } from '../api/push';
import { moveKnife, type CakeState } from '../birthday/cake';
import { usSoFar, type UsSoFar } from '../birthday/stats';
import { useChatKey } from './chat-key-provider';
import { useCouple } from './couple-provider';
import { useCoupleData } from './use-couple-data';
import { useForegroundTick } from './use-foreground-tick';

export interface BirthdayView {
  /** null until there's a room I may see: for the birthday person, until midnight. */
  room: BirthdayRoom | null;
  phase: 'before' | 'day' | 'after' | null;
  /** I made it: I can preview and edit it any time. */
  maker: boolean;
  loading: boolean;
  reload: () => Promise<void>;
  save: <K extends BirthdaySection>(section: K, value: BirthdayContent[K]) => Promise<void>;
  open: () => Promise<void>;
  mark: (index: number, right: boolean) => Promise<void>;
  keep: () => Promise<void>;
  /** A chat message back to the maker. */
  thank: (text: string) => Promise<void>;
}

/** Checked this often while there's nothing to show yet, so the room appears at midnight. */
const WAIT_MS = 5 * 60_000;

/** The birthday room, if there is one I can see, and what I can do with it. */
export function useBirthday(): BirthdayView {
  const { sb, me, couple } = useCouple();
  const { sealer } = useChatKey();
  const data = useCoupleData(BIRTHDAY_TOPIC, () => getBirthdayRoom(sb), [sb]);
  const room = data.data ?? null;
  const [now, setNow] = useState(() => Date.now());
  const lastCheck = useRef(Date.now());
  useForegroundTick(() => {
    setNow(Date.now());
    if (!room && Date.now() - lastCheck.current >= WAIT_MS) {
      lastCheck.current = Date.now();
      void data.reload();
    }
  }, 60_000);

  const id = room?.id;
  const { mutate } = data;
  return {
    room,
    phase: room ? birthdayPhase(room, now) : null,
    maker: !!room && room.from_id === me.id,
    loading: data.loading,
    reload: data.reload,
    save: useCallback(
      async (section, value) => {
        if (!room) return;
        await mutate(() => saveBirthdaySection(sb, room, section, value));
      },
      [sb, room, mutate],
    ),
    open: useCallback(async () => {
      if (id) await mutate(() => openBirthday(sb, id));
    }, [sb, id, mutate]),
    mark: useCallback(
      async (index: number, right: boolean) => {
        if (id) await mutate(() => markBirthdayQuiz(sb, id, index, right));
      },
      [sb, id, mutate],
    ),
    keep: useCallback(async () => {
      if (id) await mutate(() => keepBirthday(sb, id));
    }, [sb, id, mutate]),
    thank: useCallback(
      async (text: string) => {
        const saved = await sendMessage(sb, draftMessage(couple.id, me.id, text.trim()), await sealer());
        void notifyPartner(sb, { category: 'new_message', messageId: saved.id });
      },
      [sb, couple.id, me.id, sealer],
    ),
  };
}

/** "Us, so far", read on this device (see birthday/stats.ts). */
export function useUsSoFar(enabled: boolean): UsSoFar | null {
  const { sb, couple, me } = useCouple();
  const { cipher } = useChatKey();
  const [stats, setStats] = useState<UsSoFar | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    usSoFar(sb, couple.id, me.id, cipher)
      .then((s) => live && setStats(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, sb, couple.id, me.id, cipher]);
  return stats;
}

// ------------------------------------------------------------ cake on a call ---

let cakeOnAnswer = false;
/** The birthday room asks for the cake as soon as the call it started is picked up. */
export function bringCakeOnAnswer() {
  cakeOnAnswer = true;
}

/** Cut the cake together: the same knife on both call screens. */
export function useCallCake() {
  const { channel, me } = useCouple();
  const [cake, setCake] = useState<CakeState | null>(null);
  const current = useRef(cake);
  current.current = cake;
  const lastSent = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => channel.cake.on((e) => e.from !== me.id && setCake(e.cake)), [channel, me.id]);
  useEffect(() => () => void (trailing.current && clearTimeout(trailing.current)), []);

  const put = useCallback(
    (next: CakeState | null, now = true) => {
      current.current = next;
      setCake(next);
      if (trailing.current) clearTimeout(trailing.current);
      // A dragged knife sends ~12 times a second, and always its last spot.
      const wait = now || !next || next.cut ? 0 : 80 - (Date.now() - lastSent.current);
      if (wait <= 0) {
        lastSent.current = Date.now();
        channel.sendCake(next);
      } else {
        trailing.current = setTimeout(() => {
          lastSent.current = Date.now();
          channel.sendCake(current.current);
        }, wait);
      }
    },
    [channel],
  );

  return {
    cake,
    bringOut: useCallback(() => put({ knife: 0, cut: false }), [put]),
    move: useCallback((knife: number) => current.current && put(moveKnife(current.current, knife), false), [put]),
    putAway: useCallback(() => put(null), [put]),
    /** Bring it out if the birthday room asked for it when it started this call. */
    takeRequest: useCallback(() => {
      if (!cakeOnAnswer) return;
      cakeOnAnswer = false;
      put({ knife: 0, cut: false });
    }, [put]),
  };
}
