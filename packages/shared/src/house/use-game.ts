import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCallManager, useCallState } from '../react/call-provider';
import { minimiseCallScreen } from '../react/call-ui';
import { useCouple } from '../react/couple-provider';
import { avatarKey, MUSIC_KEY, NOTE_KEY, SKY_KEY, type ItemModel, type LookState } from './items';
import { isNight } from './sky';
import type { Emote, Together } from './presence';
import { LOOKS } from './scene/avatar';
import { createControls, nextCameraView, setView, type CameraView, type HouseControls, type HudState, type WorldProps } from './scene/world';
import { useHouse, useHouseItems, useHousePhotos } from './use-house';

const NO_HUD: HudState = { action: null, seated: false, holding: null, selected: null, nearPartner: false, invite: null, asking: null, note: null };

/**
 * Everything the house screen needs, the same on the phone and the web: the
 * world's props, what the buttons show, and what they do. The screens only
 * draw the buttons and feed in the joystick and taps.
 */
export function useHouseGame() {
  const { me, partner, mySlot, couple } = useCouple();
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
  const night = isNight(items.get(SKY_KEY), new Date());
  const music = items.get(MUSIC_KEY)?.on === true;
  const note = items.get(NOTE_KEY);
  const inCall = call.phase !== 'idle' && call.phase !== 'ended';
  const talking = call.phase === 'connected';

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
  const toggleTalk = useCallback(() => {
    if (inCall) return void calls.hangup();
    void calls.startCall('audio').catch(() => onMoment('Couldn’t start the call'));
    minimiseCallScreen();
  }, [calls, inCall, onMoment]);
  // The note on the fridge: leave one, or read theirs (and they see I did).
  const leaveNote = useCallback((text: string) => store?.set(NOTE_KEY, { text: text.trim(), by: me.id, at: new Date().toISOString() }), [store, me.id]);
  const readNote = useCallback(() => {
    if (note?.text && note.by !== me.id && !note.read) store?.set(NOTE_KEY, { ...note, read: true });
  }, [store, note, me.id]);

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
  };

  return { world, controls, hud, place, partnerPlace, partnerHere, moment, decorate, setDecorate, view, nextView, chooseView, night, toggleNight, look: mine, setLook, needsLook, actions, music, toggleMusic, inCall, talking, toggleTalk, note: note ?? null, leaveNote, readNote, meId: me.id, partnerName: partner.display_name };
}

export type HouseGame = ReturnType<typeof useHouseGame>;
