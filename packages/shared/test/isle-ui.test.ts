import { describe, expect, it } from 'vitest';
import { apply, emptyHand, hardMove, IDLE, logLines, newGame, notesFor, settleMode, tableView, tapBoard, TOPOLOGY, waitingOn, type IsleState } from '../src/isle';

const SEATS = [
  { id: 'a', name: 'Asha', bot: false },
  { id: 'b', name: 'Ben', bot: false },
  { id: 'x', name: 'Meera', bot: true },
  { id: 'y', name: 'Kabir', bot: true },
];

function played(seed: number, until: (s: IsleState) => boolean) {
  let s = newGame(SEATS, seed);
  for (let i = 0; i < 5000 && !until(s); i++) {
    const p = waitingOn(s)[0]!;
    const n = apply(s, p, hardMove(s, p));
    if (typeof n === 'string') throw new Error(n);
    s = n;
  }
  return s;
}

describe('isle screen', () => {
  it('lights the opening spots and places by tap', () => {
    const s = newGame(SEATS, 3);
    const me = waitingOn(s)[0]!;
    const v = tableView(s, me);
    expect(v.prompt).toBe('Place your first town');
    expect(v.marks?.verts?.length).toBe(54);
    const tap = tapBoard(s, me, IDLE, { kind: 'vert', i: 10 });
    expect(tap.action).toEqual({ t: 'settle', v: 10 });
    const other = (me + 1) % 4;
    expect(tableView(s, other).marks).toBeUndefined();
    expect(tableView(s, other).prompt).toMatch(/is placing a town/);
  });

  it('offers builds only when they can be paid for', () => {
    const s = structuredClone(played(5, (t) => t.phase === 'main'));
    const me = s.turn;
    s.players[me]!.hand = emptyHand();
    expect(tableView(s, me).build.every((b) => !b.ok)).toBe(true);
    s.players[me]!.hand = { wood: 1, brick: 1, wool: 0, grain: 0, ore: 0 };
    const v = tableView(s, me);
    expect(v.build.find((b) => b.what === 'road')!.ok).toBe(true);
    expect(v.canEnd).toBe(true);
    const mode = { k: 'build', what: 'road' } as const;
    const marks = tableView(s, me, mode).marks!.edges!;
    expect(marks.length).toBeGreaterThan(0);
    expect(tapBoard(s, me, mode, { kind: 'edge', i: marks[0]! }).action).toEqual({ t: 'road', e: marks[0] });
    s.players[me]!.hand = emptyHand();
    expect(settleMode(s, me, mode)).toEqual(IDLE);
  });

  it('asks who to rob when there is a choice', () => {
    const s = structuredClone(played(9, (t) => t.phase === 'main'));
    const me = s.turn;
    s.phase = 'robber';
    // A hex with two other seats' towns on it.
    for (const p of s.players) p.hand.wood = Math.max(1, p.hand.wood);
    const h = TOPOLOGY.hexes.findIndex((hex, i) => i !== s.robber && new Set(hex.verts.map((v) => s.towns[v]?.p).filter((p) => p != null && p !== me)).size >= 2);
    if (h < 0) return;
    const r = tapBoard(s, me, IDLE, { kind: 'hex', i: h });
    expect(r.mode?.k).toBe('steal');
  });

  it('writes the log in words', () => {
    const s = played(11, (t) => t.turnNo > 3);
    const lines = logLines(s, 0);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.some((l) => /rolled \d+/.test(l.text))).toBe(true);
    expect(new Set(lines.map((l) => l.n)).size).toBe(lines.length);
  });

  it('says why a build can’t be made, and what’s missing', () => {
    const s = structuredClone(played(5, (t) => t.phase === 'main'));
    const me = s.turn;
    s.players[me]!.hand = { wood: 1, brick: 0, wool: 0, grain: 1, ore: 1 };
    const v = tableView(s, me);
    const road = v.build.find((b) => b.what === 'road')!;
    expect(road.missing).toEqual({ brick: 1 });
    expect(road.why).toBe('Need 1 brick');
    expect(v.build.find((b) => b.what === 'city')!.missing).toEqual({ grain: 1, ore: 2 });
    const other = (me + 1) % 4;
    expect(tableView(s, other).build.every((b) => b.why === 'Not your turn')).toBe(true);
  });

  it('notes answers to my offer, counters included, and the trade', () => {
    const s = structuredClone(played(5, (t) => t.phase === 'main' && !t.offer));
    const me = s.turn;
    const [a, b, c] = [1, 2, 3].map((k) => (me + k) % 4) as [number, number, number];
    for (const p of s.players) p.hand = emptyHand();
    s.players[me]!.hand.wood = 2;
    s.players[a]!.hand.ore = 1;
    s.players[b]!.hand.ore = 2;
    let t = apply(s, me, { t: 'offer', give: { wood: 1 }, want: { ore: 1 } }) as IsleState;
    let n = apply(t, a, { t: 'reply', yes: false }) as IsleState;
    expect(notesFor(t, n, me).map((x) => x.text)).toEqual([`${s.players[a]!.name} rejected your offer`]);
    t = n;
    n = apply(t, b, { t: 'counter', give: { ore: 1 }, want: { wood: 2 } }) as IsleState;
    expect(notesFor(t, n, me)[0]!.text).toBe(`${s.players[b]!.name} countered: they give 1 ore for 2 wood`);
    expect(tableView(n, b).answered?.counter).toEqual({ give: { ore: 1 }, want: { wood: 2 } });
    t = apply(n, c, { t: 'reply', yes: false }) as IsleState;
    n = apply(t, me, { t: 'accept', with: b }) as IsleState;
    expect(notesFor(t, n, me).map((x) => x.text)).toContain(`Trade done with ${s.players[b]!.name}`);
    expect(notesFor(t, n, b).map((x) => x.text)).toContain(`Trade done with ${s.players[me]!.name}`);
  });
});
