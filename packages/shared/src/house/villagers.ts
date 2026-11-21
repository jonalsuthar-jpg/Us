/**
 * The village's people: a baker, a barista, a florist and a few who walk
 * about. Where each one is comes from the world's clock (sky.ts worldHours)
 * and nothing else, so both our phones show them in the same place at the
 * same moment, with nothing sent between them. Pure, so tests can check it.
 */
import type { LookState } from './items';
import { worldHours } from './sky';

export interface Villager {
  id: string;
  name: string;
  /** What they say when you come up to them. */
  hello: string[];
  look: LookState;
  /** Someone at work: where they stand, facing which way, and when (world hours). */
  post?: { x: number; z: number; h: number; from: number; to: number };
  /** Someone out walking: a loop, how fast, and when they're out (world hours). */
  route?: { points: [number, number][]; speed: number; from: number; to: number; offset: number };
}

export const VILLAGERS: Villager[] = [
  {
    id: 'baker',
    name: 'Asha',
    hello: ['Fresh bread this morning!', 'Try the cardamom buns.', 'Good to see you two again.'],
    look: { skin: '#C98E66', hair: '#1E1612', shirt: '#F4F1EA', pants: '#6B5A45', body: 'f', style: 'Hair_Buns', shoes: '#6B4423' },
    post: { x: -11.2, z: 43, h: Math.PI / 2, from: 6, to: 19 },
  },
  {
    id: 'barista',
    name: 'Leo',
    hello: ['What can I get you?', 'Two coffees coming up.', 'The window table is free.'],
    look: { skin: '#E8B48F', hair: '#6B4423', shirt: '#2E2E38', pants: '#33415C', body: 'm', style: 'Hair_SimpleParted', beard: true, shoes: '#2E2E38' },
    post: { x: 22.7, z: 44, h: -Math.PI / 2, from: 7, to: 22 },
  },
  {
    id: 'florist',
    name: 'Meera',
    hello: ['Roses are fresh today.', 'Flowers for someone special?', 'Tulips came in this morning.'],
    look: { skin: '#A26B48', hair: '#3B2416', shirt: '#E3A13B', pants: '#4F6D4A', body: 'f', style: 'Hair_Long', shoes: '#B5524A' },
    post: { x: -9.1, z: 53, h: Math.PI / 2, from: 8, to: 18 },
  },
  {
    id: 'walker',
    name: 'Ravi',
    hello: ['Lovely evening for a walk.', 'Morning!', 'Have you seen the ducks?'],
    look: { skin: '#7A4B30', hair: '#8A8A8A', shirt: '#4E6E8E', pants: '#2E2E38', body: 'm', style: 'Hair_Buzzed', shoes: '#2E2E38' },
    route: {
      points: [[-44, 33], [-8, 33], [-8, 56], [8, 56], [8, 33], [44, 33], [44, 38], [30, 38], [30, 33]],
      speed: 1.1,
      from: 7,
      to: 21,
      offset: 0,
    },
  },
  {
    id: 'jogger',
    name: 'Zoe',
    hello: ['Hi!', 'Beautiful park, isn’t it?', 'Three laps to go!'],
    look: { skin: '#F2C9A8', hair: '#D9B26B', shirt: '#D94F70', pants: '#2E2E38', body: 'f', style: 'Hair_BuzzedFemale', shoes: '#F2F0EA' },
    route: { points: [[27.5, 37.5], [56.5, 37.5], [56.5, 74.5], [27.5, 74.5]], speed: 2.4, from: 6, to: 20, offset: 40 },
  },
  {
    id: 'stroller',
    name: 'Dev',
    hello: ['The pond is so calm today.', 'Hello there!'],
    look: { skin: '#C98E66', hair: '#1E1612', shirt: '#7C9A3A', pants: '#6B5A45', body: 'm', style: 'Hair_SimpleParted', shoes: '#6B4423' },
    route: { points: [[35, 49], [49, 49], [49, 63], [35, 63]], speed: 0.9, from: 8, to: 20, offset: 12 },
  },
];

export interface VillagerPose {
  x: number;
  z: number;
  /** Heading, radians, 0 facing +z. */
  h: number;
  moving: boolean;
  speed: number;
}

const onDuty = (hours: number, from: number, to: number) => hours >= from && hours < to;

/** Where a loop of points is, this far along it (metres), and which way it heads. */
function along(points: [number, number][], d: number): { x: number; z: number; h: number } {
  const legs = points.map((p, i) => {
    const q = points[(i + 1) % points.length]!;
    return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });
  const total = legs.reduce((s, l) => s + l.len, 0);
  let left = ((d % total) + total) % total;
  for (const { p, q, len } of legs) {
    if (left <= len) {
      const k = len ? left / len : 0;
      return { x: p[0] + (q[0] - p[0]) * k, z: p[1] + (q[1] - p[1]) * k, h: Math.atan2(q[0] - p[0], q[1] - p[1]) };
    }
    left -= len;
  }
  const p = points[0]!;
  return { x: p[0], z: p[1], h: 0 };
}

/** Where a villager is at a real moment, or null when they're home (not out in the village). */
export function villagerAt(v: Villager, nowMs: number, coupleId = ''): VillagerPose | null {
  const hours = worldHours(nowMs, coupleId);
  if (v.post) {
    if (!onDuty(hours, v.post.from, v.post.to)) return null;
    return { x: v.post.x, z: v.post.z, h: v.post.h, moving: false, speed: 0 };
  }
  if (v.route) {
    if (!onDuty(hours, v.route.from, v.route.to)) return null;
    const at = along(v.route.points, (nowMs / 1000) * v.route.speed + v.route.offset);
    return { ...at, moving: true, speed: v.route.speed };
  }
  return null;
}

/** What a villager says when you come up to them: one of theirs, the same for a while. */
export function villagerHello(v: Villager, nowMs: number): string {
  return `${v.name}: ${v.hello[Math.floor(nowMs / 600_000) % v.hello.length]}`;
}

/** The ducks on the pond: where each is now, paddling slow circles. */
export function duckAt(i: number, nowMs: number, pond: { x0: number; x1: number; z0: number; z1: number }): { x: number; z: number; h: number } {
  const cx = (pond.x0 + pond.x1) / 2 + Math.sin(i * 2.1) * 2;
  const cz = (pond.z0 + pond.z1) / 2 + Math.cos(i * 1.7) * 2;
  const r = 1.4 + (i % 3) * 0.9;
  const dir = i % 2 ? 1 : -1;
  const a = (nowMs / 1000) * (0.12 + i * 0.02) * dir + i;
  // Facing the way it's going round.
  return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, h: Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir) };
}
