import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAPSULE_TOPIC, capsuleProblem, capsulesWaiting, sealCapsule } from '../api/capsules';
import { notifyPartner } from '../api/push';
import { earn, getWallet, spend, WALLET_TOPIC, walletLineText, walletRef, type Wallet } from '../api/wallet';
import { listCountdowns, upcoming } from '../api/together';
import { useCallManager, useCallState } from '../react/call-provider';
import { useChatKey } from '../react/chat-key-provider';
import { minimiseCallScreen, setCallBubbleHidden, useCallBubbleHidden } from '../react/call-ui';
import { useCouple } from '../react/couple-provider';
import { avatarKey, MUSIC_KEY, NOTE_KEY, SKY_KEY, type ItemModel, type LookState } from './items';
import { formatWorldTime, isNight, untilWorld, worldHours } from './sky';
import type { Emote, Together } from './presence';
import { LOOKS } from './scene/avatar';
import type { HouseLetters, HouseWallet } from './scene/fun';
import { createControls, nextCameraView, setView, type CameraView, type HouseControls, type HudState, type WorldProps } from './scene/world';
import { useHouse, useHouseItems, useHousePhotos } from './use-house';

const NO_HUD: HudState = { action: null, seated: false, holding: null, selected: null, nearPartner: false, invite: null, asking: null, note: null, fun: { panel: null, banner: null, cover: null, myMood: null, partnerMood: null } };

/**
 * Everything the house screen needs, the same on the phone and the web: the
 * world's props, what the buttons show, and what they do. The screens only
 * draw the buttons and feed in the joystick and taps.
 */
export function useHouseGame() {
  const { me, partner, mySlot, couple, sb, channel } = useCouple();
  const { sealer } = useChatKey();
  const call = useCallState();
  const calls = useCallManager();
  const { presence, store, partnerHere } = useHouse();
  const items = useHouseItems(store);
  const photos = useHousePhotos();
  const controls = useMemo<HouseControls>(createControls, []);
  const [hud, setHud] = useState<HudState>(NO_HUD);
  const [place, setPlace] = useState('');
  const [partnerPlace, setPartnerPlace] = useState<string | null>(null);
  const [moment, setMoment] = useState<string | null>(null);
  const [decorate, setDecorateState] = useState(false);
  const [view, setViewState] = useState<HouseControls['view']>('close');
  const momentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMoment = useCallback((text: string) => {
    setMoment(text);
    if (momentTimer.current) clearTimeout(momentTimer.current);
    momentTimer.current = setTimeout(() => setMoment(null), 3200);
  }, []);
  useEffect(() => () => void (momentTimer.current && clearTimeout(momentTimer.current)), []);

  const myKey = avatarKey(me.id);
  const theirKey = avatarKey(partner.id);
  // items changes whenever the store does, which is when a look could have.
  const mine: LookState = useMemo(() => store?.look(myKey) ?? LOOKS[mySlot === 'a' ? 0 : 1]!, [store, myKey, mySlot, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const theirs: LookState = useMemo(() => store?.look(theirKey) ?? LOOKS[mySlot === 'a' ? 1 : 0]!, [store, theirKey, mySlot, items]); // eslint-disable-line react-hooks/exhaustive-deps
  // The world's clock (a day in 4 hours), shown on screen; ticks every world minute.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const night = isNight(items.get(SKY_KEY), new Date(tick), couple.id);
  const hoursNow = worldHours(tick, couple.id);
  const until = untilWorld(hoursNow);
  const worldClock = { time: formatWorldTime(hoursNow), next: night ? `Morning in ${Math.ceil(until.dawn)} min` : `Night in ${Math.ceil(until.dusk)} min` };
  const music = items.get(MUSIC_KEY)?.on === true;
  const note = items.get(NOTE_KEY);
  const inCall = call.phase !== 'idle' && call.phase !== 'ended';
  const talking = call.phase === 'connected';
  // How loud each of us is, a few times a second while we talk: who's speaking shows.
  const voice = useMemo(() => ({ me: 0, them: 0 }), []);
  useEffect(() => {
    if (!talking) {
      voice.me = 0;
      voice.them = 0;
      return;
    }
    const t = setInterval(() => {
      void calls.audioLevels().then((l) => {
        voice.me = l.me ?? 0;
        voice.them = l.them ?? 0;
      });
    }, 200);
    return () => clearInterval(t);
  }, [talking, calls, voice]);
  // Their camera, on the TV (web) or in a little window (phone), and mine to switch on.
  const theirVideo = talking && call.remote.camera ? call.remoteStream : null;
  const myVideo = talking && call.local.camera;
  const toggleVideo = useCallback(() => void calls.toggleCamera().catch(() => onMoment('Couldn’t use the camera')), [calls, onMoment]);

  const cmd = controls.cmds;
  const actions = useMemo(
    () => ({
      use: () => cmd.push({ t: 'use' }),
      emote: (e: Emote) => controls.emotes.push(e),
      rotate: (by: number) => cmd.push({ t: 'rotate', by }),
      paint: (color: string) => cmd.push({ t: 'paint', color }),
      remove: () => cmd.push({ t: 'remove' }),
      add: (model: ItemModel) => cmd.push({ t: 'add', model }),
      deselect: () => cmd.push({ t: 'deselect' }),
      invite: (kind: Together) => cmd.push({ t: 'invite', kind }),
      answer: (yes: boolean) => cmd.push({ t: 'answer', yes }),
      photo: () => cmd.push({ t: 'photo' }),
      fun: () => cmd.push({ t: 'fun' }),
      pick: (id: string, text?: string) => cmd.push({ t: 'pick', id, text }),
      closePanel: () => cmd.push({ t: 'closePanel' }),
    }),
    [cmd, controls],
  );

  const setDecorate = useCallback(
    (on: boolean) => {
      controls.decorate = on;
      controls.move = [0, 0];
      setDecorateState(on);
    },
    [controls],
  );

  // The camera button: my eyes, close, far, the whole house, round again.
  const chooseView = useCallback(
    (v: CameraView) => {
      setView(controls, v);
      setViewState(v);
    },
    [controls],
  );
  const nextView = useCallback(() => chooseView(nextCameraView(controls.view)), [chooseView, controls]);

  // "Night for now" (or day): for both of us, for a few hours; then the clock again.
  const toggleNight = useCallback(() => store?.set(SKY_KEY, { on: !night, at: new Date().toISOString() }), [store, night]);
  // The speaker: the same bar for both of us.
  const toggleMusic = useCallback(() => store?.set(MUSIC_KEY, music ? { on: false } : { on: true, at: new Date().toISOString() }), [store, music]);
  // Talk: a voice call, kept as a small bar so the house stays on screen.
  const bubbleHidden = useCallBubbleHidden();
  const toggleTalk = useCallback(() => {
    if (inCall && bubbleHidden) return setCallBubbleHidden(false);
    if (inCall) return void calls.hangup();
    void calls.startCall('audio').catch(() => onMoment('Couldn’t start the call'));
    minimiseCallScreen();
  }, [calls, inCall, bubbleHidden, onMoment]);
  // The note on the fridge: leave one, or read theirs (and they see I did).
  const leaveNote = useCallback((text: string) => store?.set(NOTE_KEY, { text: text.trim(), by: me.id, at: new Date().toISOString() }), [store, me.id]);
  const readNote = useCallback(() => {
    if (note?.text && note.by !== me.id && !note.read) store?.set(NOTE_KEY, { ...note, read: true });
  }, [store, note, me.id]);

  // A push for my partner when they're not in: a gift, their turn, a letter. At most one of each every ten minutes.
  const pushed = useRef(new Map<string, number>());
  const notify = useCallback(
    (event: 'gift' | 'turn' | 'in' | 'letter') => {
      const last = pushed.current.get(event) ?? 0;
      if (Date.now() - last < (event === 'in' ? 6 * 3600_000 : 10 * 60_000)) return;
      pushed.current.set(event, Date.now());
      void notifyPartner(sb, { category: 'house', event });
    },
    [sb],
  );
  // Coming in while my partner's out: they hear, once in a while, after I've been in a little.
  const hereRef = useRef(partnerHere);
  hereRef.current = partnerHere;
  useEffect(() => {
    const t = setTimeout(() => !hereRef.current && notify('in'), 45_000);
    return () => clearTimeout(t);
  }, [notify]);

  // Today's birthday, anniversary or milestone: the house throws a party.
  const [celebrate, setCelebrate] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void listCountdowns(sb, couple.id)
      .then((cds) => {
        const today = upcoming(cds, couple.paired_at, new Date(), 12).find((u) => u.daysLeft === 0);
        if (live) setCelebrate(today ? `${today.title} ${today.emoji}` : null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, couple.id, couple.paired_at]);

  // Letters: sealed time capsules, delivered into the chat on their day.
  const [waiting, setWaiting] = useState<{ waiting: number; nextAt: string | null }>({ waiting: 0, nextAt: null });
  const loadWaiting = useCallback(() => void capsulesWaiting(sb).then(setWaiting).catch(() => {}), [sb]);
  useEffect(loadWaiting, [loadWaiting]);
  const letters: HouseLetters = useMemo(
    () => ({
      ...waiting,
      seal: async (text: string, at: Date) => {
        const problem = capsuleProblem(at);
        if (problem) throw new Error(problem);
        const cipher = await sealer();
        if (!cipher) throw new Error('Letters need encrypted chat. It turns on once you both have the new app.');
        await sealCapsule(sb, { coupleId: couple.id, me: me.id }, text, at, cipher);
        channel.sendChanged(CAPSULE_TOPIC);
      },
    }),
    [waiting, sealer, sb, couple.id, me.id, channel],
  );

  // Our money: loaded here, kept fresh when my partner earns or spends, a bonus for coming home each day.
  const [purse, setPurse] = useState<Wallet>({ balance: 0, recent: [] });
  const loadWallet = useCallback(() => void getWallet(sb, me.id).then(setPurse).catch(() => {}), [sb, me.id]);
  useEffect(loadWallet, [loadWallet]);
  useEffect(() => channel.changes.on((e) => void (e.topic === WALLET_TOPIC && loadWallet())), [channel, loadWallet]);
  const wallet: HouseWallet = useMemo(
    () => ({
      balance: purse.balance,
      recent: purse.recent,
      earn: (reason, ref) =>
        void earn(sb, reason, ref)
          .then((r) => {
            if (!r.added) return;
            setPurse((w) => ({ ...w, balance: r.balance }));
            onMoment(`+${r.added} 🪙 ${walletLineText({ reason, delta: r.added }).replace(/ \+\d+$/, '').toLowerCase()}`);
            channel.sendChanged(WALLET_TOPIC);
            loadWallet();
          })
          .catch(() => {}),
      spend: async (item, ref) => {
        try {
          const r = await spend(sb, item, ref);
          setPurse((w) => ({ ...w, balance: r.balance }));
          channel.sendChanged(WALLET_TOPIC);
          loadWallet();
          return true;
        } catch {
          return false;
        }
      },
    }),
    [purse, sb, channel, loadWallet, onMoment],
  );
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current) return;
    welcomed.current = true;
    const d = new Date();
    wallet.earn('daily', walletRef('daily', me.id, `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`));
  }, [wallet, me.id]);

  const setLook = useCallback((patch: Partial<LookState>) => store?.set(myKey, { ...mine, ...patch }), [store, myKey, mine]);
  // No look of mine saved yet, once we know: the house invites me to make one.
  const needsLook = !!store?.loaded && !store.look(myKey);

  const world: WorldProps = {
    quality: 'medium',
    controls,
    presence,
    store,
    items,
    photos,
    meId: me.id,
    partnerId: partner.id,
    partnerName: partner.display_name,
    mine,
    theirs,
    onPlace: setPlace,
    onPartnerPlace: setPartnerPlace,
    onHud: setHud,
    onMoment,
    coupleId: couple.id,
    talking,
    voice,
    pairedAt: couple.paired_at,
    celebrate,
    letters,
    notify,
    wallet,
  };

  return { world, controls, hud, place, partnerPlace, partnerHere, moment, decorate, setDecorate, view, nextView, chooseView, night, toggleNight, look: mine, setLook, needsLook, actions, music, toggleMusic, inCall, talking, toggleTalk, bubbleHidden, worldClock, coins: purse.balance, theirVideo, myVideo, toggleVideo, remoteStream: talking ? call.remoteStream : null, note: note ?? null, leaveNote, readNote, meId: me.id, partnerName: partner.display_name };
}

export type HouseGame = ReturnType<typeof useHouseGame>;
