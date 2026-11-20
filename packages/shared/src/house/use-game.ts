import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCouple } from '../react/couple-provider';
import { avatarKey, SKY_KEY, type ItemModel, type LookState } from './items';
import type { Emote } from './presence';
import { LOOKS } from './scene/avatar';
import { createControls, setView, type HouseControls, type HudState, type WorldProps } from './scene/world';
import { useHouse, useHouseItems, useHousePhotos } from './use-house';

const NO_HUD: HudState = { action: null, seated: false, holding: null, selected: null };

/**
 * Everything the house screen needs, the same on the phone and the web: the
 * world's props, what the buttons show, and what they do. The screens only
 * draw the buttons and feed in the joystick and taps.
 */
export function useHouseGame() {
  const { me, partner, mySlot } = useCouple();
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
  const night = items.get(SKY_KEY)?.on === true;

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

  const toggleView = useCallback(() => {
    const next = controls.view === 'close' ? 'above' : 'close';
    setView(controls, next);
    setViewState(next);
  }, [controls]);

  const toggleNight = useCallback(() => store?.set(SKY_KEY, { on: !night }), [store, night]);

  const setLook = useCallback((patch: Partial<LookState>) => store?.set(myKey, { ...mine, ...patch }), [store, myKey, mine]);

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
  };

  return { world, controls, hud, place, partnerPlace, partnerHere, moment, decorate, setDecorate, view, toggleView, night, toggleNight, look: mine, setLook, actions, partnerName: partner.display_name };
}

export type HouseGame = ReturnType<typeof useHouseGame>;
