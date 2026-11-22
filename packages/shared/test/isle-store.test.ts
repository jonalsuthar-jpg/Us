import { describe, expect, it } from 'vitest';
import {
  hardMove,
  IsleStore,
  StaleIsleError,
  waitingOn,
  type IsleApi,
  type IsleClock,
  type IsleGame,
  type IsleLink,
  type IsleState,
  type IsleWire,
} from '../src/isle';

/** A fake clock: timers run when the test moves time on. */
class Clock implements IsleClock {
  t = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private next = 1;
  now = () => this.t;
  later = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  };
  cancel = (id: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== id);
  };
  async run(ms: number) {
    const end = this.t + ms;
    for (;;) {
      await flush();
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const due = this.timers[0];
      if (!due || due.at > end) break;
      this.timers.shift();
      this.t = due.at;
      due.fn();
    }
    this.t = end;
    await flush();
  }
}

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** The server: save_isle only takes a state further on than what's saved. */
class Server {
  games = new Map<string, { state: IsleState; status: string; at: number }>();
  saves = 0;
  stale = 0;
  private n = 0;
  api(): IsleApi {
    return {
      load: async (): Promise<IsleGame | null> => {
        await flush();
        const rows = [...this.games.entries()].filter(([, g]) => g.status !== 'abandoned').sort((a, b) => b[1].at - a[1].at);
        return rows[0] ? { id: rows[0][0], state: structuredClone(rows[0][1].state) } : null;
      },
      start: async (state) => {
        await flush();
        for (const g of this.games.values()) if (g.status === 'playing') g.status = 'abandoned';
        const id = `g${++this.n}`;
        this.games.set(id, { state: structuredClone(state), status: 'playing', at: this.n });
        return id;
      },
      save: async (id, state) => {
        await flush();
        const g = this.games.get(id);
        if (!g || g.status !== 'playing' || g.state.mv >= state.mv) {
          this.stale++;
          throw new StaleIsleError();
        }
        this.saves++;
        g.state = structuredClone(state);
        if (state.phase === 'over') g.status = 'over';
        return state.mv;
      },
    };
  }
}

/** The couple channel between two phones; messages can be held back or dropped. */
class Bus {
  private subs = new Map<string, (w: IsleWire) => void>();
  held: { to: string; w: IsleWire }[] = [];
  hold = false;
  drop: ((w: IsleWire, to: string) => boolean) | null = null;
  link(me: string): IsleLink {
    return {
      send: (w) => {
        for (const [to, fn] of this.subs) {
          if (to === me) continue;
          if (this.drop?.(w, to)) continue;
          const copy = structuredClone(w);
          if (this.hold) this.held.push({ to, w: copy });
          else queueMicrotask(() => this.subs.get(to)?.(copy));
        }
      },
      on: (fn) => {
        this.subs.set(me, fn);
        return () => void this.subs.delete(me);
      },
    };
  }
  release() {
    this.hold = false;
    const all = this.held;
    this.held = [];
    for (const { to, w } of all) this.subs.get(to)?.(w);
  }
}

const SEATS = [
  { id: 'a', name: 'A', bot: false },
  { id: 'b', name: 'B', bot: false },
  { id: 'bot:1', name: 'Tara', bot: true },
  { id: 'bot:2', name: 'Dev', bot: true },
];

function table() {
  const clock = new Clock();
  const server = new Server();
  const bus = new Bus();
  const a = new IsleStore(server.api(), bus.link('a'), 'a', clock);
  const b = new IsleStore(server.api(), bus.link('b'), 'b', clock);
  return { clock, server, bus, a, b };
}

/** Each human plays their own seat (with the hard bot's brain) whenever the game waits on them. */
function playHumans(...stores: IsleStore[]) {
  for (const st of stores) {
    const { game, seat } = st.snapshot();
    if (!game || seat < 0 || game.state.phase === 'over') continue;
    if (waitingOn(game.state).includes(seat)) {
      const why = st.move(seat, hardMove(game.state, seat));
      if (why) throw new Error(`${st.me}: ${why}`);
    }
  }
}

const stateOf = (st: IsleStore) => st.snapshot().game!.state;

describe('isle store', () => {
  it('a new game shows on both phones', async () => {
    const { clock, a, b } = table();
    await a.open();
    await b.open();
    await a.start(SEATS, 99);
    await clock.run(10);
    expect(b.snapshot().game?.id).toBe(a.snapshot().game?.id);
    expect(stateOf(b)).toEqual(stateOf(a));
    expect(a.snapshot().partnerHere).toBe(true);
    expect(b.snapshot().partnerHere).toBe(true);
    expect(a.drivesBots()).toBe(true);
    expect(b.drivesBots()).toBe(false);
  });

  it('plays a whole game in step, the bots moving once each time', async () => {
    const { clock, server, a, b } = table();
    await a.open();
    await b.open();
    await a.start(SEATS, 1234);
    for (let i = 0; i < 20000 && stateOf(a).phase !== 'over'; i++) {
      playHumans(a, b);
      await clock.run(400);
    }
    await clock.run(3000);
    expect(stateOf(a).phase).toBe('over');
    expect(stateOf(b)).toEqual(stateOf(a));
    const saved = [...server.games.values()][0]!;
    expect(saved.state).toEqual(stateOf(a));
    expect(saved.status).toBe('over');
  }, 60000);

  it('two moves from the same point: the late one is played again on top', async () => {
    const { clock, server, bus, a, b } = table();
    await a.open();
    await b.open();
    await a.start(SEATS, 77);
    // Play on until a human is mid-turn with a card to offer.
    const ready = () => {
      const s = stateOf(a);
      const st = [a, b].find((x) => x.snapshot().seat === s.turn);
      if (!st || s.phase !== 'main' || s.offer) return null;
      const hand = s.players[s.turn]!.hand;
      const give = (['wood', 'brick', 'wool', 'grain', 'ore'] as const).find((r) => hand[r] > 0);
      return give ? { st, give } : null;
    };
    let found: ReturnType<typeof ready> = null;
    for (let i = 0; i < 2000 && !(found = ready()); i++) {
      playHumans(a, b);
      await clock.run(400);
    }
    expect(found).not.toBeNull();
    const { st: offerer, give } = found!;
    const answerer = offerer === a ? b : a;
    const mine = offerer.snapshot().seat;
    expect(offerer.move(mine, { t: 'offer', give: { [give]: 1 }, want: { [give === 'ore' ? 'wool' : 'ore']: 1 } })).toBeNull();
    await clock.run(10);
    const before = stateOf(a).mv;
    // Both phones move at once without hearing each other.
    bus.hold = true;
    expect(answerer.move(answerer.snapshot().seat, { t: 'reply', yes: false })).toBeNull();
    expect(offerer.move(mine, { t: 'cancel' })).toBeNull();
    await clock.run(2000);
    bus.release();
    await clock.run(4000);
    expect(server.stale).toBeGreaterThan(0);
    expect(stateOf(a)).toEqual(stateOf(b));
    expect(stateOf(a).mv).toBeGreaterThan(before);
    expect([...server.games.values()][0]!.state.mv).toBe(stateOf(a).mv);
  }, 60000);

  it('a lost message is caught up', async () => {
    const { clock, bus, a, b } = table();
    await a.open();
    await b.open();
    await a.start(SEATS, 5);
    await clock.run(10);
    let dropped = 0;
    bus.drop = (w, to) => to === 'b' && w.k === 'move' && dropped++ < 1;
    for (let i = 0; i < 40; i++) {
      playHumans(a, b);
      await clock.run(400);
    }
    await clock.run(5000);
    expect(dropped).toBeGreaterThanOrEqual(1);
    expect(stateOf(b)).toEqual(stateOf(a));
  }, 60000);

  it('both phones playing the bots for a while still counts each bot move once', async () => {
    const { clock, server, bus, a, b } = table();
    await a.open();
    await a.start(SEATS, 4242);
    // b opens without hearing a, and a's hello to b never came: each thinks it's alone.
    bus.hold = true;
    await b.open();
    await b.load();
    bus.held = [];
    bus.hold = false;
    const alone = (st: IsleStore) => (st as unknown as { partnerHere: boolean }).partnerHere;
    (a as unknown as { setPartner(h: boolean): void }).setPartner(false);
    (b as unknown as { setPartner(h: boolean): void }).setPartner(false);
    expect(alone(a) || alone(b)).toBe(false);
    expect(a.drivesBots() && b.drivesBots()).toBe(true);
    // Both play every bot move themselves, hearing each other only now and then.
    bus.hold = true;
    for (let i = 0; i < 120; i++) {
      playHumans(a, b);
      await clock.run(400);
      if (i % 10 === 9) {
        bus.release();
        bus.hold = true;
        (a as unknown as { setPartner(h: boolean): void }).setPartner(false);
        (b as unknown as { setPartner(h: boolean): void }).setPartner(false);
      }
    }
    bus.release();
    await clock.run(6000);
    expect(stateOf(a)).toEqual(stateOf(b));
    expect([...server.games.values()][0]!.state).toEqual(stateOf(a));
    // Every bot move is in the log once: no move numbers repeat in the recent ids.
    const ids = stateOf(a).recent;
    expect(new Set(ids).size).toBe(ids.length);
  }, 60000);

  it('with my partner away, my phone plays the bots', async () => {
    const { clock, a, b } = table();
    await a.open();
    await b.open();
    await a.start(SEATS, 8);
    await clock.run(10);
    b.close();
    await clock.run(10);
    expect(a.snapshot().partnerHere).toBe(false);
    // b has the lower-id role only when present; a plays alone now either way.
    expect(a.drivesBots()).toBe(true);
    const start = stateOf(a).mv;
    for (let i = 0; i < 30; i++) {
      playHumans(a);
      await clock.run(400);
    }
    expect(stateOf(a).mv).toBeGreaterThan(start);
  });

  it('comes back to a saved game', async () => {
    const { clock, server, bus, a } = table();
    await a.open();
    await a.start(SEATS, 9);
    for (let i = 0; i < 20; i++) {
      playHumans(a);
      await clock.run(400);
    }
    await clock.run(2000);
    const later = new IsleStore(server.api(), bus.link('a2'), 'a', clock);
    await later.open();
    expect(stateOf(later)).toEqual(stateOf(a));
  });
});
