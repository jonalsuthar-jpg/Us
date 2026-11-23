/**
 * Short notes about what just happened, for the corner of the table: a trade
 * done, an offer accepted, rejected or countered, a card stolen, a monopoly,
 * the bonuses changing hands. Worked out from two states, the one before and
 * the one now, so both screens say the same.
 */
import { RESOURCES } from './board';
import type { Hand, IsleEvent, IsleState } from './rules';
import { DEV_INFO, describe, RES_INFO } from './ui';

/** The new events since a state. */
export function freshEvents(prev: IsleState | null, s: IsleState): IsleEvent[] {
  if (!prev || s.n <= prev.n) return [];
  return s.log.slice(Math.max(0, s.log.length - (s.n - prev.n)));
}

/** A short note about something that just happened, for a corner of the screen. */
export interface IsleNote {
  id: string;
  text: string;
  tone: 'good' | 'bad' | 'info';
  /** The seat it's about, for their colour. */
  p?: number;
}

const cards = (h: Partial<Hand>) =>
  RESOURCES.filter((r) => h[r])
    .map((r) => `${h[r]} ${RES_INFO[r].label.toLowerCase()}`)
    .join(', ');

/** The notes worth showing me for what just happened. */
export function notesFor(prev: IsleState, s: IsleState, me: number): IsleNote[] {
  const out: IsleNote[] = [];
  const name = (p: number) => (p === me ? 'You' : s.players[p]!.name);
  const add = (text: string, tone: IsleNote['tone'], p?: number) => out.push({ id: `${s.n}-${s.mv}-${out.length}`, text, tone, p });

  // Answers to my offer, as they come in.
  const po = prev.offer;
  const so = s.offer;
  if (po && so && po.from === me && so.from === me) {
    so.replies.forEach((r, p) => {
      if (p === me || po.replies[p] === r) return;
      const c = so.counters?.[p];
      if (c) add(`${name(p)} countered: they give ${cards(c.give)} for ${cards(c.want)}`, 'info', p);
      else if (r === true) add(`${name(p)} accepted your offer`, 'good', p);
      else if (r === false) add(`${name(p)} rejected your offer`, 'bad', p);
    });
  }
  const events = freshEvents(prev, s);
  // An offer to me taken back without a trade.
  if (po && !so && po.from !== me && !events.some((e) => e.k === 'trade')) add(`${name(po.from)} withdrew the offer`, 'info', po.from);

  for (const e of events) {
    switch (e.k) {
      case 'trade':
        if (e.p === me || e.with === me) add(`Trade done with ${name(e.p === me ? e.with : e.p)}`, 'good', e.p === me ? e.with : e.p);
        else add(`${name(e.p)} traded with ${name(e.with)}`, 'info', e.p);
        break;
      case 'monopoly':
        if (e.p === me) add(`Monopoly: you collected ${e.n} ${RES_INFO[e.r].label.toLowerCase()}`, 'good');
        else {
          const lost = prev.players[me]?.hand[e.r] ?? 0;
          add(`${name(e.p)} played Monopoly on ${RES_INFO[e.r].label.toLowerCase()}${lost ? `: you gave ${lost}` : ''}`, lost ? 'bad' : 'info', e.p);
        }
        break;
      case 'steal':
        if (e.from === me) add(`${name(e.p)} took a card from you`, 'bad', e.p);
        else if (e.p === me) add(`You took a card from ${name(e.from)}`, 'good', e.from);
        break;
      case 'bank':
        if (e.p === me) add(`Traded ${e.n} ${RES_INFO[e.give].label.toLowerCase()} for 1 ${RES_INFO[e.get].label.toLowerCase()}`, 'good');
        break;
      case 'play':
        if (e.p !== me && e.card !== 'vp') add(`${name(e.p)} played ${DEV_INFO[e.card].label}`, 'info', e.p);
        break;
      case 'gain':
        if (e.p === me && events.some((x) => x.k === 'play' && x.card === 'plenty')) add(`Year of Plenty: you took ${cards(e.cards)}`, 'good');
        break;
      case 'longest':
      case 'army': {
        const text = describe(s, me, e);
        if (text) add(text, e.p === me ? 'good' : 'info', e.p ?? undefined);
        break;
      }
    }
  }
  return out;
}
