/**
 * Our village: the map, in one place. The app walks it (layout.ts takes its
 * regions), lights it (lamps) and seats us (benches, café chairs); the
 * Blender build (scripts/blender/build_village.py, through
 * scripts/export-village-layout.mjs) makes its art from these same numbers,
 * so what you see is where you can walk.
 *
 * Metres, like the house: x east, z south (away from the house), y up.
 * Through a gate in the garden's south hedge, a grassy lane runs down to the
 * village street. Off the street: the square with its fountain, the café
 * (you can go in), the bakery and a flower stall; cottages; and the park
 * with its pond; at the west end, up a path, a small Shiva temple. South of
 * the square a path runs down to a beach on a lake, with a jetty and a
 * rowing boat; east of the park one climbs a hill to a viewpoint. Trees all
 * round frame it, and the world fades into haze beyond.
 */

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** The gap in the garden's south hedge (the hedge runs at z 15–15.8). */
export const GATE = { x0: 3.6, x1: 6.4, z0: 15, z1: 15.8 } as const;

/** Walkable ground, each a region you can be anywhere in (see layout.ts). */
export const VILLAGE_REGIONS = [
  { id: 'gate', x0: 3.8, x1: 6.2, z0: 15, z1: 16, label: 'Garden gate' },
  { id: 'lane', x0: 3.5, x1: 6.5, z0: 16, z1: 30, label: 'The lane' },
  { id: 'street', x0: -58, x1: 58, z0: 30, z1: 36, label: 'Village street' },
  // The square goes round the fountain.
  { id: 'squareW', x0: -12, x1: -3, z0: 36, z1: 58, label: 'The square' },
  { id: 'squareE', x0: 3, x1: 12, z0: 36, z1: 58, label: 'The square' },
  { id: 'squareN', x0: -3, x1: 3, z0: 36, z1: 43.6, label: 'The square' },
  { id: 'squareS', x0: -3, x1: 3, z0: 50.4, z1: 58, label: 'The square' },
  { id: 'cafe', x0: 12.6, x1: 23.4, z0: 38.6, z1: 49.4, label: 'The café' },
  // The park goes round the pond.
  { id: 'parkW', x0: 26, x1: 36, z0: 36, z1: 76, label: 'The park' },
  { id: 'parkE', x0: 48, x1: 58, z0: 36, z1: 76, label: 'The park' },
  { id: 'parkN', x0: 36, x1: 48, z0: 36, z1: 50, label: 'The park' },
  { id: 'parkS', x0: 36, x1: 48, z0: 62, z1: 76, label: 'The park' },
  // The temple: the path up to its gateway, the courtyard, the pillared hall (shoes off here).
  { id: 'templePath', x0: -57, x1: -53.5, z0: 36, z1: 46, label: 'The temple path' },
  { id: 'templeCourt', x0: -61, x1: -47, z0: 46, z1: 53, label: 'The temple' },
  { id: 'templeHall', x0: -58, x1: -50, z0: 53, z1: 57, label: 'The temple' },
  // Down to the lake: the path, the beach, the shallows to paddle in, the jetty (a step up, over the water).
  { id: 'lakePath', x0: -2, x1: 2, z0: 58, z1: 88, label: 'The lake path' },
  { id: 'beach', x0: -30, x1: 40, z0: 88, z1: 97, label: 'The beach' },
  { id: 'shallows', x0: -30, x1: 40, z0: 97, z1: 100, label: 'The shallows', y: -0.18 },
  { id: 'jetty', x0: 18, x1: 20.5, z0: 97, z1: 112, label: 'The jetty', y: 0.3 },
  // Up the hill: a path that climbs 6 m, and the top.
  { id: 'hillPath', x0: 58, x1: 78, z0: 55, z1: 58.5, label: 'The hill path', ramp: { y0: 0, y1: 6 } },
  { id: 'hillTop', x0: 78, x1: 92, z0: 48, z1: 66, label: 'The hilltop', y: 6 },
] as const;

/** A region's floor: flat at its height, or a slope rising along x from y0 to y1. */
export interface RegionFloor {
  y?: number;
  ramp?: { y0: number; y1: number };
}

export type VillageRegionId = (typeof VILLAGE_REGIONS)[number]['id'];

/** Where regions with a wall between them meet: [a, b, x, z]. The rest touch and are open. */
export const VILLAGE_PORTALS: [string, string, number, number][] = [
  ['gardenS', 'gate', 5, 15],
  ['gate', 'lane', 5, 16],
  ['lane', 'street', 5, 30],
  ['street', 'squareW', -7, 36],
  ['street', 'squareE', 7, 36],
  ['street', 'squareN', 0, 36],
  ['squareW', 'squareN', -3, 40],
  ['squareE', 'squareN', 3, 40],
  ['squareW', 'squareS', -3, 54],
  ['squareE', 'squareS', 3, 54],
  // The café's door, on its west wall onto the square.
  ['squareE', 'cafe', 12.3, 44],
  ['street', 'parkW', 31, 36],
  ['street', 'parkN', 42, 36],
  ['street', 'parkE', 53, 36],
  ['parkW', 'parkN', 36, 43],
  ['parkE', 'parkN', 48, 43],
  ['parkW', 'parkS', 36, 69],
  ['parkE', 'parkS', 48, 69],
  ['street', 'templePath', -55.2, 36],
  // Through the gateway.
  ['templePath', 'templeCourt', -55.2, 46],
  // Up the hall's steps.
  ['templeCourt', 'templeHall', -54, 53],
  ['squareS', 'lakePath', 0, 58],
  ['lakePath', 'beach', 0, 88],
  ['beach', 'shallows', 5, 97],
  ['beach', 'jetty', 19.25, 97],
  ['parkE', 'hillPath', 58, 56.7],
  ['hillPath', 'hillTop', 78, 56.7],
];

/** The lake: its water, the shore, the jetty's end (the boat and the fishing spot), where shells wash up. */
export const LAKE = {
  water: { x0: -45, x1: 56, z0: 97, z1: 142 },
  surface: -0.06,
  jettyEnd: { x: 19.25, z: 111.4 },
  boatDock: { x: 21.6, z: 109.5 },
  /** The boat's loop round the lake, from the dock and back. */
  loop: { x: 6, z: 120, rx: 15.5, rz: 10.5 },
  shells: { x0: -26, x1: 36, z0: 90, z1: 96.5 },
} as const;

/**
 * The hilltop: the love-lock railing along its west edge (the village below,
 * the sunset beyond), either side of where the path comes up; a bench there.
 */
export const HILL = {
  top: { x0: 78, x1: 92, z0: 48, z1: 66, y: 6 },
  railing: { x: 77.8, spans: [[48.2, 54.6], [59, 65.8]] },
  bench: { x: 79.6, z: 51.5, ry: -Math.PI / 2 },
} as const;

const smooth = (t: number) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/**
 * The ground's height at (x, z): flat everywhere but the hill, a plateau 6 m
 * up falling away over 10 m, with the path climbing its west side. The same
 * formula shapes the hill in Blender (build_village.py hill_height), so trees
 * and lamp posts stand on it.
 */
export function groundY(x: number, z: number): number {
  const t = HILL.top;
  const d = Math.hypot(Math.max(t.x0 - x, 0, x - t.x1), Math.max(t.z0 - z, 0, z - t.z1));
  const plateau = t.y * smooth(1 - d / 10);
  let path = 0;
  if (x >= 56 && x <= 80) {
    const ramp = (Math.min(Math.max(x, 58), 78) - 58) / 20 * t.y;
    path = ramp * smooth(1 - (Math.abs(z - 56.75) - 1.75) / 3);
  }
  return Math.max(plateau, path);
}

/** Beach loungers to lie on: [x, z, facing (the lake)]. */
export const LOUNGERS: [number, number, number][] = [
  [-6, 93, 0],
  [-4, 93, 0],
];

export type Wall = 'plasterYellow' | 'plasterWhite' | 'plasterRed' | 'plasterBlue' | 'plasterClay' | 'siding';
export type Roof = 'roofSlate' | 'roofGrey' | 'roof';

export interface Building extends Rect {
  id: string;
  label: string;
  /** Wall height to the eaves. */
  h: number;
  wall: Wall;
  roof: Roof;
  /** The ridge runs along x or along z. */
  ridge: 'x' | 'z';
  /** The front door: which side faces out, and where along it. */
  door: { side: 'n' | 's' | 'e' | 'w'; at: number };
  /** A sign over the door, and an awning in this colour. */
  sign?: string;
  awning?: string;
  /** You can walk in (its inside is a region). */
  inside?: boolean;
}

export const BUILDINGS: Building[] = [
  { id: 'cafe', label: 'The café', x0: 12, x1: 24, z0: 38, z1: 50, h: 4.2, wall: 'plasterYellow', roof: 'roofSlate', ridge: 'z', door: { side: 'w', at: 44 }, sign: 'Café', awning: '#2F6B5A', inside: true },
  { id: 'bakery', label: 'The bakery', x0: -24, x1: -12, z0: 38, z1: 48, h: 4.2, wall: 'plasterWhite', roof: 'roofSlate', ridge: 'z', door: { side: 'e', at: 43 }, sign: 'Bakery', awning: '#B5524A' },
  { id: 'house1', label: 'A cottage', x0: -50, x1: -41, z0: 38, z1: 46, h: 3.4, wall: 'plasterBlue', roof: 'roof', ridge: 'x', door: { side: 'n', at: -45.5 } },
  { id: 'house2', label: 'A cottage', x0: -38, x1: -29, z0: 38, z1: 46, h: 3.4, wall: 'plasterClay', roof: 'roofGrey', ridge: 'x', door: { side: 'n', at: -33.5 } },
  { id: 'house3', label: 'A cottage', x0: -47, x1: -38, z0: 20, z1: 28, h: 3.4, wall: 'plasterRed', roof: 'roofSlate', ridge: 'x', door: { side: 's', at: -42.5 } },
  { id: 'house4', label: 'A cottage', x0: -33, x1: -24, z0: 20, z1: 28, h: 3.4, wall: 'plasterYellow', roof: 'roof', ridge: 'x', door: { side: 's', at: -28.5 } },
  { id: 'house5', label: 'A cottage', x0: 18, x1: 27, z0: 20, z1: 28, h: 3.4, wall: 'plasterWhite', roof: 'roofGrey', ridge: 'x', door: { side: 's', at: 22.5 } },
  { id: 'house6', label: 'A cottage', x0: 33, x1: 42, z0: 20, z1: 28, h: 3.4, wall: 'plasterBlue', roof: 'roofSlate', ridge: 'x', door: { side: 's', at: 37.5 } },
  { id: 'house7', label: 'A cottage', x0: 47, x1: 56, z0: 20, z1: 28, h: 3.4, wall: 'plasterClay', roof: 'roof', ridge: 'x', door: { side: 's', at: 51.5 } },
];

/** What the ground is made of; later entries are drawn over earlier ones. */
export const GROUNDS: (Rect & { kind: 'lanePath' | 'cobble' | 'squarePaving' | 'parkPath' | 'cafeFloor' })[] = [
  { kind: 'lanePath', x0: 3.8, x1: 6.2, z0: 15, z1: 30 },
  { kind: 'cobble', x0: -60, x1: 60, z0: 30, z1: 36 },
  { kind: 'squarePaving', x0: -12, x1: 12, z0: 36, z1: 58 },
  { kind: 'parkPath', x0: 26, x1: 29, z0: 36, z1: 76 },
  { kind: 'parkPath', x0: 55, x1: 58, z0: 36, z1: 76 },
  { kind: 'parkPath', x0: 26, x1: 58, z0: 73, z1: 76 },
  { kind: 'parkPath', x0: 34, x1: 50, z0: 48, z1: 64 },
  { kind: 'cafeFloor', x0: 12.2, x1: 23.8, z0: 38.2, z1: 49.8 },
  // The lake path.
  { kind: 'lanePath', x0: -1.6, x1: 1.6, z0: 58, z1: 88 },
  // The temple: its path, the courtyard and the hall's stone floor.
  { kind: 'cobble', x0: -57, x1: -53.5, z0: 36, z1: 46 },
  { kind: 'squarePaving', x0: -61, x1: -47, z0: 46, z1: 53 },
  { kind: 'squarePaving', x0: -58.4, x1: -49.6, z0: 53, z1: 57.2 },
];

export const FOUNTAIN = { x: 0, z: 47, r: 2.6 } as const;
export const POND: Rect = { x0: 36.5, x1: 47.5, z0: 50.5, z1: 61.5 };
/**
 * Street food and the weekend market: where each stands, which way its front faces (ry), and where
 * you stand to buy (to). The carts are drawn in code (scene/fun.tsx); the people are in villagers.ts.
 */
export const STALLS = {
  chaat: { x: 8.6, z: 40.2, ry: -Math.PI / 2, to: { x: 7.4, z: 40.2 } },
  kulfi: { x: 42, z: 39.6, ry: 0, to: { x: 42, z: 40.9 } },
  spices: { x: -7.2, z: 39.6, ry: Math.PI / 2, to: { x: -6, z: 39.6 } },
  greens: { x: 7.2, z: 55.4, ry: -Math.PI / 2, to: { x: 6, z: 55.4 } },
} as const;
export type StallId = keyof typeof STALLS;

/**
 * Play in the park: the tandem cycle's stand on the street and its ride (along the street and once round
 * the park on the joggers' path, back to the stand); the two-seat swing set (its seats along z, facing +x);
 * the kites on their post.
 */
export const CYCLE = {
  stand: { x: -1, z: 33.2, h: Math.PI / 2 },
  route: [
    [-1, 33.2], [27, 33.2], [27.5, 37.5], [56.5, 37.5], [56.5, 74.5], [27.5, 74.5], [27.5, 37.5], [27, 33.2], [-1, 33.2],
  ] as [number, number][],
} as const;
export const SWINGS = { x: 31, z: 54, seats: [53.35, 54.65] } as const;
export const KITES = { x: 42, z: 70 } as const;

/** The flower stall on the square. */
export const STALL = { x: -8, z: 53, ry: Math.PI / 2 } as const;

/**
 * The temple, for Shiva, small and South Indian: a gateway with a little
 * tiered tower onto the courtyard, a pillared hall (mandapa) where Nandi
 * sits facing the sanctum, and the sanctum (garbhagriha) with the lingam,
 * under its stepped tower (vimana). Shoes come off at the hall's steps.
 */
export const TEMPLE = {
  gateway: { x0: -57.6, x1: -52.9, z: 46 },
  hall: { x0: -58, x1: -50, z0: 53, z1: 57 },
  sanctum: { x0: -57, x1: -51, z0: 57, z1: 60.6 },
  lingam: { x: -54, z: 59 },
  nandi: { x: -54, z: 54.4 },
  bell: { x: -54, z: 53.25, y: 2.55 },
  diyas: { x: -51.6, z: 56.4 },
  rack: { x: -59.2, z: 52.3 },
} as const;

/** Lamp posts: along both sides of the street, round the square, down the lane, round the park. */
export const LAMPS: [number, number][] = [
  [3.2, 20], [6.8, 26],
  ...[-48, -36, -24, -12, 12, 24, 36, 48].flatMap((x): [number, number][] => [[x, 29.6], [x + 6, 36.4]]),
  [-12.4, 46], [12.4, 52], [-6, 58.4], [6, 58.4],
  [30, 50], [54, 50], [30, 66], [54, 66], [42, 76.4],
  [-57.4, 40], [-53.1, 44.5],
  [2.6, 66], [-2.6, 76], [2.6, 86], [-12, 87.6], [12, 87.6], [18.25, 104], [20.25, 104],
  [64, 54.6], [72, 59], [79, 48.6], [91, 48.6],
];

/** Benches you can sit on: [x, z, facing]. */
export const BENCHES: [number, number, number][] = [
  [-5, 47, Math.PI / 2],
  [5, 47, -Math.PI / 2],
  [0, 41, 0],
  [0, 53, Math.PI],
  [35, 56, Math.PI / 2],
  [49, 56, -Math.PI / 2],
  [42, 49, 0],
];

/** The café's tables: [x, z]; two chairs each, facing across. */
export const CAFE_TABLES: [number, number][] = [
  [15, 41],
  [15, 47],
  [19, 47],
  // Outside, on the square.
  [9, 41],
  [9, 46.5],
];

/** Trees: [x, z, kind (0 round, 1 tall, 2 conifer), size]. Outside where you walk, framing the village. */
export const TREES: [number, number, number, number][] = [
  // Along the lane and the meadows behind the street.
  [1.5, 18, 0, 1], [8.5, 19, 1, 1.1], [1.2, 25, 2, 0.9], [9, 26, 0, 1.2], [-4, 22, 0, 1.3], [13, 22, 2, 1],
  [-10, 24, 1, 1.2], [-17, 21, 0, 1.1], [30, 24, 0, 1.2], [44.5, 23.5, 2, 1.1], [-35, 17.5, 0, 1.3], [-52, 24, 2, 1.2],
  // Round the square.
  [-11, 56.6, 0, 0.9], [11, 56.6, 0, 0.9], [-11, 37.6, 1, 0.8], [11, 37.6, 1, 0.8],
  // Behind the cottages and the bakery.
  [-46, 50, 0, 1.2], [-34, 51, 2, 1.1], [-27, 50, 0, 1], [-18, 52, 1, 1.2], [-16, 60, 0, 1.3], [-30, 58, 2, 1.2], [-44, 58, 0, 1.1],
  [17, 54, 0, 1.1], [22, 56, 2, 1], [16, 62, 1, 1.2],
  // The park.
  [31, 42, 0, 1.3], [31, 58, 1, 1.2], [32, 70, 0, 1.2], [53, 42, 2, 1.1], [52, 58, 0, 1.3], [52, 70, 1, 1.1], [39, 70, 0, 1], [45, 44, 2, 0.9],
  // The edges.
  [-60.5, 29, 2, 1.3], [-59.5, 41, 0, 1.2], [64, 33, 2, 1.3], [64, 44, 0, 1.2], [62, 60, 2, 1.3], [62, 74, 0, 1.2], [-4.5, 64, 0, 1.3], [-8, 66, 2, 1.2], [8, 66, 1, 1.2],
  // Along the lake path, by the beach, and on the hill.
  [-5, 74, 1, 1.2], [5, 80, 0, 1.1], [-34, 90, 0, 1.3], [44, 90, 2, 1.2], [-20, 86.5, 1, 1.1], [30, 86.6, 0, 1.2],
  [62, 50, 0, 1.2], [70, 62, 2, 1.2], [76, 52, 1, 1.1], [94, 52, 0, 1.3], [94, 64, 2, 1.2], [84, 68, 0, 1.3],
  [24, 80, 0, 1.3], [40, 82, 2, 1.3], [56, 82, 0, 1.2], [-20, 70, 0, 1.3], [-40, 66, 2, 1.2], [-61.5, 58, 0, 1.3],
  // The temple's peepal tree, beside the courtyard.
  [-46.2, 57.5, 0, 1.6],
];

/**
 * Zones, for drawing: the village is one walk (no loading anywhere in it),
 * but a part far from me isn't drawn. Each has its own art and light map.
 */
export const ZONES: (Rect & { id: 'west' | 'square' | 'park' | 'lake' | 'hill' })[] = [
  { id: 'west', x0: -62, x1: -13, z0: 14, z1: 86 },
  { id: 'square', x0: -13, x1: 25, z0: 14, z1: 86 },
  { id: 'park', x0: 25, x1: 68, z0: 14, z1: 86 },
  { id: 'lake', x0: -48, x1: 60, z0: 86, z1: 146 },
  { id: 'hill', x0: 68, x1: 104, z0: 30, z1: 86 },
];

/** From up high (the hilltop) you see further: the whole village below. */
export const ZONE_DRAW_DISTANCE_HIGH = 170;

/**
 * What you walk round, not through, inside walkable ground: tree trunks and
 * lamp posts that stand there. [x, z, radius].
 */
export function obstacles(inside: (x: number, z: number) => boolean): [number, number, number][] {
  return [
    ...TREES.filter(([x, z]) => inside(x, z)).map(([x, z, , s]): [number, number, number] => [x, z, 0.45 * s]),
    ...LAMPS.filter(([x, z]) => inside(x, z)).map(([x, z]): [number, number, number] => [x, z, 0.22]),
    // Nandi, seated in the temple hall.
    [TEMPLE.nandi.x, TEMPLE.nandi.z, 0.7],
    // The street-food carts (there every day; the market's stalls only at weekends, so walk-through then).
    [STALLS.chaat.x, STALLS.chaat.z, 0.75],
    [STALLS.kulfi.x, STALLS.kulfi.z, 0.75],
    // The swing set's posts, and the kite post.
    [SWINGS.x, SWINGS.z - 1.2, 0.2],
    [SWINGS.x, SWINGS.z + 1.2, 0.2],
    [KITES.x, KITES.z, 0.2],
  ];
}

/** Beyond this distance from me a zone isn't drawn (the haze is thick by then). */
export const ZONE_DRAW_DISTANCE = 70;

/** Where "Go to…" (Things to do) walks you: a clear spot at each place, on the paths. */
export const GO_TO: { id: string; label: string; emoji: string; x: number; y: number; z: number }[] = [
  { id: 'home', label: 'Home', emoji: '🏡', x: -2.5, y: 0, z: 1.5 },
  { id: 'cafe', label: 'The café', emoji: '☕', x: 14, y: 0, z: 44 },
  { id: 'bakery', label: 'The bakery', emoji: '🥖', x: -10.5, y: 0, z: 43 },
  { id: 'park', label: 'The park', emoji: '🦆', x: 42, y: 0, z: 46 },
  { id: 'temple', label: 'The temple', emoji: '🛕', x: -54, y: 0, z: 48 },
  { id: 'beach', label: 'The beach', emoji: '🏖️', x: 0, y: 0, z: 92 },
  { id: 'jetty', label: 'The jetty', emoji: '🚣', x: 19.25, y: 0.3, z: 108 },
  { id: 'hill', label: 'The hilltop', emoji: '⛰️', x: 82, y: 6, z: 57 },
];
