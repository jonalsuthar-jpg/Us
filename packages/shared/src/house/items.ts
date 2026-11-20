/**
 * Everything in Our House you can use, carry or move: the catalog and the
 * rules, no drawing. Each thing has a key, a default place and a saved state
 * (house_items). Missing rows mean "as it came".
 *
 *   light      a lamp: on or off
 *   door       a door that swings: open or shut. Shut front and balcony
 *              doors open by themselves as you walk through (see blocksAt)
 *   tv         on or off; shows our Memories when on
 *   frame      a photo frame showing one of our Memories
 *   carry      something small you pick up, carry and put down
 *   furniture  stays put unless we move it while decorating; some have seats
 *   stove      where you cook; a dish appears on the table when it's done
 *   plant      a garden plant that grows a little each day it's watered
 */
import { FLOOR_H, type RegionId } from './layout';

export type ItemKind = 'light' | 'door' | 'tv' | 'frame' | 'carry' | 'furniture' | 'stove' | 'plant';

/** Which shape draws it (scene/items.tsx). */
export type ItemModel =
  | 'sofa' | 'armchair' | 'coffeeTable' | 'tvUnit' | 'bookshelf' | 'floorLamp' | 'rug' | 'plantPot' | 'diningTable' | 'chair'
  | 'counter' | 'fridge' | 'pendant' | 'bed' | 'nightstand' | 'bedLamp' | 'wardrobe' | 'desk' | 'deskLamp' | 'balconyChair'
  | 'balconyTable' | 'lounger' | 'umbrella' | 'frontDoor' | 'balconyDoor' | 'mug' | 'book' | 'pillow' | 'ball' | 'teddy'
  | 'vase' | 'wateringCan' | 'frame' | 'gardenPlant' | 'beanbag' | 'dish';

export interface Seat {
  /** From the item's centre, in its own frame (before it's turned). */
  x: number;
  z: number;
  /** Seat height. */
  y: number;
  /** Lie down (bed, lounger) or sit. */
  lie?: boolean;
}

export interface ItemDef {
  key: string;
  kind: ItemKind;
  model: ItemModel;
  label: string;
  /** Default place: floor position and turn (radians; 0 faces +z). */
  x: number;
  y: number;
  z: number;
  ry: number;
  /** Footprint half sizes in its own frame, for putting things on top and picking it in decorate. */
  hw: number;
  hd: number;
  /** Things you put down here sit at this height above its floor. */
  top?: number;
  seats?: Seat[];
  /** Can be recoloured while decorating. */
  paint?: boolean;
  /** Can be moved while decorating. Fixed things (doors, the stove) can't. */
  movable?: boolean;
  /** A door between two regions: the portal it sits in. */
  portal?: [RegionId, RegionId];
}

const F = FLOOR_H;
const T = Math.PI;

export const ITEMS: ItemDef[] = [
  // Living room
  { key: 'sofa', kind: 'furniture', model: 'sofa', label: 'Sofa', x: -1.55, y: 0, z: 0, ry: -T / 2, hw: 1.3, hd: 0.48, paint: true, movable: true, seats: [{ x: -0.5, z: 0.05, y: 0.45 }, { x: 0.5, z: 0.05, y: 0.45 }] },
  { key: 'coffee_table', kind: 'furniture', model: 'coffeeTable', label: 'Coffee table', x: -2.95, y: 0, z: 0, ry: T / 2, hw: 0.55, hd: 0.35, top: 0.43, movable: true },
  { key: 'tv', kind: 'tv', model: 'tvUnit', label: 'TV', x: -5.55, y: 0, z: 0, ry: T / 2, hw: 1.1, hd: 0.25, top: 0.5, movable: true },
  { key: 'bookshelf', kind: 'furniture', model: 'bookshelf', label: 'Bookshelf', x: -4.9, y: 0, z: -3.6, ry: 0, hw: 0.7, hd: 0.2, paint: true, movable: true },
  { key: 'floor_lamp', kind: 'light', model: 'floorLamp', label: 'Lamp', x: -0.6, y: 0, z: -3.2, ry: 0, hw: 0.25, hd: 0.25, movable: true },
  { key: 'rug_living', kind: 'furniture', model: 'rug', label: 'Rug', x: -2.8, y: 0, z: 0, ry: 0, hw: 1.8, hd: 1.6, paint: true, movable: true },
  { key: 'plant_living', kind: 'furniture', model: 'plantPot', label: 'Plant', x: 0.4, y: 0, z: 3.4, ry: 0, hw: 0.3, hd: 0.3, movable: true },
  { key: 'armchair', kind: 'furniture', model: 'armchair', label: 'Armchair', x: -3.0, y: 0, z: 2.6, ry: T, hw: 0.45, hd: 0.45, paint: true, movable: true, seats: [{ x: 0, z: 0.05, y: 0.45 }] },
  { key: 'frame_living', kind: 'frame', model: 'frame', label: 'Photo', x: -4.9, y: 1.9, z: -3.55, ry: 0, hw: 0.2, hd: 0.05 },

  // Kitchen
  { key: 'counter', kind: 'stove', model: 'counter', label: 'Stove', x: 5.5, y: 0, z: 0.5, ry: -T / 2, hw: 2.3, hd: 0.33, top: 0.92 },
  { key: 'fridge', kind: 'door', model: 'fridge', label: 'Fridge', x: 5.47, y: 0, z: -2.27, ry: -T / 2, hw: 0.37, hd: 0.37 },
  { key: 'dining_table', kind: 'furniture', model: 'diningTable', label: 'Table', x: 3.1, y: 0, z: 1.6, ry: 0, hw: 0.7, hd: 0.8, top: 0.78, paint: true, movable: true },
  { key: 'chair_1', kind: 'furniture', model: 'chair', label: 'Chair', x: 2.05, y: 0, z: 1.25, ry: T / 2, hw: 0.22, hd: 0.22, paint: true, movable: true, seats: [{ x: 0, z: 0, y: 0.47 }] },
  { key: 'chair_2', kind: 'furniture', model: 'chair', label: 'Chair', x: 2.05, y: 0, z: 1.95, ry: T / 2, hw: 0.22, hd: 0.22, paint: true, movable: true, seats: [{ x: 0, z: 0, y: 0.47 }] },
  { key: 'chair_3', kind: 'furniture', model: 'chair', label: 'Chair', x: 4.15, y: 0, z: 1.25, ry: -T / 2, hw: 0.22, hd: 0.22, paint: true, movable: true, seats: [{ x: 0, z: 0, y: 0.47 }] },
  { key: 'chair_4', kind: 'furniture', model: 'chair', label: 'Chair', x: 4.15, y: 0, z: 1.95, ry: -T / 2, hw: 0.22, hd: 0.22, paint: true, movable: true, seats: [{ x: 0, z: 0, y: 0.47 }] },
  { key: 'pendant', kind: 'light', model: 'pendant', label: 'Ceiling light', x: 3.1, y: 0, z: 1.6, ry: 0, hw: 0.15, hd: 0.15 },
  { key: 'front_door', kind: 'door', model: 'frontDoor', label: 'Front door', x: -3.6, y: 0, z: 4, ry: 0, hw: 0.6, hd: 0.05, portal: ['living', 'gardenN'] },

  // Upstairs
  { key: 'bed', kind: 'furniture', model: 'bed', label: 'Bed', x: -4.7, y: F, z: 0, ry: T / 2, hw: 1.0, hd: 1.1, paint: true, movable: true, seats: [{ x: -0.45, z: 0.85, y: 0.62, lie: true }, { x: 0.45, z: 0.85, y: 0.62, lie: true }] },
  { key: 'nightstand_1', kind: 'furniture', model: 'nightstand', label: 'Nightstand', x: -5.55, y: F, z: -1.35, ry: T / 2, hw: 0.25, hd: 0.25, top: 0.55, movable: true },
  { key: 'nightstand_2', kind: 'furniture', model: 'nightstand', label: 'Nightstand', x: -5.55, y: F, z: 1.35, ry: T / 2, hw: 0.25, hd: 0.25, top: 0.55, movable: true },
  { key: 'bed_lamp', kind: 'light', model: 'bedLamp', label: 'Bedside lamp', x: -5.55, y: F + 0.55, z: -1.35, ry: 0, hw: 0.1, hd: 0.1 },
  { key: 'wardrobe', kind: 'door', model: 'wardrobe', label: 'Wardrobe', x: -1.5, y: F, z: -3.5, ry: 0, hw: 1.1, hd: 0.3 },
  { key: 'rug_bed', kind: 'furniture', model: 'rug', label: 'Rug', x: -3.0, y: F, z: 0, ry: 0, hw: 1.6, hd: 1.8, paint: true, movable: true },
  { key: 'desk', kind: 'furniture', model: 'desk', label: 'Desk', x: 5.35, y: F, z: 1.75, ry: -T / 2, hw: 0.85, hd: 0.45, top: 0.77, movable: true },
  { key: 'desk_lamp', kind: 'light', model: 'deskLamp', label: 'Desk lamp', x: 5.5, y: F + 0.77, z: 2.35, ry: 0, hw: 0.1, hd: 0.1 },
  { key: 'beanbag', kind: 'furniture', model: 'beanbag', label: 'Beanbag', x: 3.2, y: F, z: 2.6, ry: T, hw: 0.45, hd: 0.45, paint: true, movable: true, seats: [{ x: 0, z: 0, y: 0.3 }] },
  { key: 'plant_landing', kind: 'furniture', model: 'plantPot', label: 'Plant', x: 1.6, y: F, z: 3.4, ry: 0, hw: 0.3, hd: 0.3, movable: true },
  { key: 'balcony_door', kind: 'door', model: 'balconyDoor', label: 'Balcony door', x: -4.1, y: F, z: 4, ry: 0, hw: 0.6, hd: 0.05, portal: ['bedroom', 'balcony'] },
  { key: 'balcony_chair_1', kind: 'furniture', model: 'balconyChair', label: 'Chair', x: -3.7, y: F, z: 5.0, ry: T / 2, hw: 0.3, hd: 0.3, paint: true, movable: true, seats: [{ x: 0, z: 0, y: 0.45 }] },
  { key: 'balcony_chair_2', kind: 'furniture', model: 'balconyChair', label: 'Chair', x: -1.7, y: F, z: 5.0, ry: -T / 2, hw: 0.3, hd: 0.3, paint: true, movable: true, seats: [{ x: 0, z: 0, y: 0.45 }] },
  { key: 'balcony_table', kind: 'furniture', model: 'balconyTable', label: 'Table', x: -2.7, y: F, z: 5.0, ry: 0, hw: 0.3, hd: 0.3, top: 0.5, movable: true },

  // Garden
  { key: 'lounger_1', kind: 'furniture', model: 'lounger', label: 'Lounger', x: 3.55, y: 0, z: 12.0, ry: T, hw: 0.35, hd: 0.9, paint: true, movable: true, seats: [{ x: 0, z: 0.75, y: 0.42, lie: true }] },
  { key: 'lounger_2', kind: 'furniture', model: 'lounger', label: 'Lounger', x: 5.35, y: 0, z: 12.0, ry: T, hw: 0.35, hd: 0.9, paint: true, movable: true, seats: [{ x: 0, z: 0.75, y: 0.42, lie: true }] },
  { key: 'umbrella', kind: 'furniture', model: 'umbrella', label: 'Umbrella', x: 7.2, y: 0, z: 12.0, ry: 0, hw: 0.2, hd: 0.2, paint: true, movable: true },
  { key: 'garden_plant_1', kind: 'plant', model: 'gardenPlant', label: 'Plant', x: -7.75, y: 0, z: 8.05, ry: 0, hw: 0.3, hd: 0.3 },
  { key: 'garden_plant_2', kind: 'plant', model: 'gardenPlant', label: 'Plant', x: -6.25, y: 0, z: 8.05, ry: 0, hw: 0.3, hd: 0.3 },
  { key: 'garden_plant_3', kind: 'plant', model: 'gardenPlant', label: 'Plant', x: -9.5, y: 0, z: 6.0, ry: 0, hw: 0.3, hd: 0.3 },

  // Small things to carry.
  { key: 'mug', kind: 'carry', model: 'mug', label: 'Mug', x: 5.5, y: 0.92, z: -1.4, ry: 0, hw: 0.06, hd: 0.06 },
  { key: 'mug_2', kind: 'carry', model: 'mug', label: 'Mug', x: 5.45, y: 0.92, z: -1.1, ry: 0.6, hw: 0.06, hd: 0.06 },
  { key: 'book', kind: 'carry', model: 'book', label: 'Book', x: -2.95, y: 0.43, z: 0.2, ry: 0.3, hw: 0.12, hd: 0.09 },
  { key: 'pillow', kind: 'carry', model: 'pillow', label: 'Pillow', x: -1.7, y: 0.5, z: 0.9, ry: 0.2, hw: 0.2, hd: 0.2 },
  { key: 'ball', kind: 'carry', model: 'ball', label: 'Ball', x: -5, y: 0, z: 10, ry: 0, hw: 0.15, hd: 0.15 },
  { key: 'teddy', kind: 'carry', model: 'teddy', label: 'Teddy', x: -4.0, y: F + 0.6, z: 0.6, ry: T / 2, hw: 0.12, hd: 0.12 },
  { key: 'vase', kind: 'carry', model: 'vase', label: 'Flowers', x: 3.1, y: 0.78, z: 1.6, ry: 0, hw: 0.1, hd: 0.1 },
  { key: 'watering_can', kind: 'carry', model: 'wateringCan', label: 'Watering can', x: -8.6, y: 0, z: 7.4, ry: 0.5, hw: 0.15, hd: 0.1 },
];

const byKey = new Map(ITEMS.map((i) => [i.key, i]));

/** Things we can add while decorating; each copy gets its own key (add:<model>:<id>). */
export const ADDABLE: { model: ItemModel; label: string; kind: ItemKind; def: Pick<ItemDef, 'hw' | 'hd' | 'top' | 'seats' | 'paint'> }[] = [
  { model: 'plantPot', label: 'Plant', kind: 'furniture', def: { hw: 0.3, hd: 0.3 } },
  { model: 'armchair', label: 'Armchair', kind: 'furniture', def: { hw: 0.45, hd: 0.45, paint: true, seats: [{ x: 0, z: 0.05, y: 0.45 }] } },
  { model: 'beanbag', label: 'Beanbag', kind: 'furniture', def: { hw: 0.45, hd: 0.45, paint: true, seats: [{ x: 0, z: 0, y: 0.3 }] } },
  { model: 'floorLamp', label: 'Lamp', kind: 'light', def: { hw: 0.25, hd: 0.25 } },
  { model: 'rug', label: 'Rug', kind: 'furniture', def: { hw: 1.8, hd: 1.6, paint: true } },
  { model: 'bookshelf', label: 'Bookshelf', kind: 'furniture', def: { hw: 0.7, hd: 0.2, paint: true } },
  { model: 'coffeeTable', label: 'Side table', kind: 'furniture', def: { hw: 0.55, hd: 0.35, top: 0.43 } },
];

export const MAX_ADDED = 24;

/** A paint colour while decorating. */
export const PAINTS = ['#4E6E8E', '#C9885E', '#7C9A8A', '#B5524A', '#E9D8B8', '#3B3B44', '#D9A3B8', '#E3C44F', '#6B4E8E', '#F4F1EA'];

/** What's saved for one thing. Every field optional: missing means the default. */
export interface ItemState {
  on?: boolean;
  open?: boolean;
  /** Moved: where it is now. */
  x?: number;
  y?: number;
  z?: number;
  ry?: number;
  color?: string;
  /** When it was set (ISO): "Night for now" lasts a few hours from here. */
  at?: string;
  /** A note on the fridge: what it says and who left it. */
  text?: string;
  by?: string;
  /** The note has been read by the one it was left for. */
  read?: boolean;
  /** frame / tv: which memory photo. */
  photo?: string;
  /** plant: 0–4, and the day (YYYY-MM-DD) it was last watered. */
  growth?: number;
  watered?: string;
  /** Added while decorating: what it is. */
  model?: ItemModel;
}

export interface PlacedItem extends ItemDef {
  state: ItemState;
}

/** An added thing's key, or null when the key isn't one. */
export function addedModel(key: string): ItemModel | null {
  const m = /^add:([a-z]+):[a-z0-9]{4,12}$/.exec(key);
  return (m && ADDABLE.find((a) => a.model.toLowerCase() === m[1])?.model) || null;
}

/** A key for a newly added thing (keys are lower case, like the database wants). */
export const addedKey = (model: ItemModel, id: string) => `add:${model.toLowerCase()}:${id}`;

/** Everything in the house right now: the catalog with saved changes, plus what we added. */
export function placeItems(saved: ReadonlyMap<string, ItemState>): PlacedItem[] {
  const out: PlacedItem[] = [];
  for (const d of ITEMS) out.push(place(d, saved.get(d.key) ?? {}));
  for (const [key, state] of saved) {
    if (byKey.has(key) || !key.startsWith('add:')) continue;
    const model = addedModel(key);
    const add = model && ADDABLE.find((a) => a.model === model);
    if (!add || state.x === undefined || state.z === undefined) continue;
    out.push(place({ key, kind: add.kind, model: add.model, label: add.label, x: 0, y: 0, z: 0, ry: 0, movable: true, ...add.def }, state));
  }
  return out;
}

function place(d: ItemDef, s: ItemState): PlacedItem {
  return { ...d, x: num(s.x, d.x), y: num(s.y, d.y), z: num(s.z, d.z), ry: num(s.ry, d.ry), state: s };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export const itemDef = (key: string): ItemDef | undefined => byKey.get(key);

/** Doors that start shut: the way in and the way out to the balcony. */
export function isOpen(item: PlacedItem): boolean {
  if (item.kind !== 'door') return false;
  return item.state.open ?? false;
}

/** Lights start on in the evening glow: the floor lamp and the pendant. */
export function isOn(item: PlacedItem): boolean {
  if (item.state.on !== undefined) return item.state.on;
  return item.key === 'floor_lamp' || item.key === 'pendant';
}

/** A point (x, z) in the item's own frame, turned and moved to the world. */
export function toWorld(item: Pick<ItemDef, 'x' | 'z' | 'ry'>, lx: number, lz: number): [number, number] {
  const c = Math.cos(item.ry);
  const s = Math.sin(item.ry);
  return [item.x + lx * c + lz * s, item.z - lx * s + lz * c];
}

/** The world point (x, z) in the item's own frame. */
export function toLocal(item: Pick<ItemDef, 'x' | 'z' | 'ry'>, x: number, z: number): [number, number] {
  const dx = x - item.x;
  const dz = z - item.z;
  const c = Math.cos(item.ry);
  const s = Math.sin(item.ry);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Whether (x, z) is over the item's footprint, with some slack. */
export function over(item: PlacedItem, x: number, z: number, pad = 0): boolean {
  const [lx, lz] = toLocal(item, x, z);
  return Math.abs(lx) <= item.hw + pad && Math.abs(lz) <= item.hd + pad;
}

/** Where a seat is in the world, and which way you face sitting in it. */
export function seatPose(item: PlacedItem, i: number): { x: number; y: number; z: number; h: number; lie: boolean } | null {
  const s = item.seats?.[i];
  if (!s) return null;
  const [x, z] = toWorld(item, s.x, s.z);
  return { x, y: item.y + s.y, z, h: item.ry, lie: !!s.lie };
}

/**
 * Where something put down at (x, z) on floor y comes to rest: on top of a
 * table, counter or shelf under it, or on the floor.
 */
export function restingY(items: PlacedItem[], x: number, y: number, z: number, skip?: string): number {
  let best = y;
  for (const it of items) {
    if (it.key === skip || it.top === undefined || Math.abs(it.y - y) > 0.5) continue;
    if (over(it, x, z, -0.02)) best = Math.max(best, it.y + it.top);
  }
  return best;
}

/** Shut doors close their doorway; walking up to one opens it. */
export function doorFor(a: RegionId, b: RegionId, items: PlacedItem[]): PlacedItem | undefined {
  return items.find((i) => i.portal && ((i.portal[0] === a && i.portal[1] === b) || (i.portal[0] === b && i.portal[1] === a)));
}

/** Today as YYYY-MM-DD, here. */
export const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** Water a plant: it grows one step a day, up to 4. Watering twice in a day does nothing more. */
export function water(s: ItemState, day: string): ItemState {
  if (s.watered === day) return s;
  return { ...s, watered: day, growth: Math.min(4, (s.growth ?? 0) + 1) };
}

/** Keeps a state small and sane before it's saved or after it's received. */
export function cleanState(s: unknown): ItemState | null {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const o = s as Record<string, unknown>;
  const out: ItemState = {};
  for (const k of ['on', 'open'] as const) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  for (const k of ['x', 'y', 'z', 'ry'] as const) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 60) out[k] = Math.round(v * 1000) / 1000;
  }
  if (typeof o.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(o.color)) out.color = o.color;
  if (typeof o.photo === 'string' && o.photo.length <= 300) out.photo = o.photo;
  if (typeof o.at === 'string' && o.at.length <= 40 && Number.isFinite(Date.parse(o.at))) out.at = o.at;
  if (typeof o.text === 'string' && o.text.trim() && o.text.length <= NOTE_MAX) out.text = o.text;
  if (typeof o.by === 'string' && /^[0-9a-f-]{1,64}$/i.test(o.by)) out.by = o.by;
  if (typeof o.read === 'boolean') out.read = o.read;
  if (typeof o.growth === 'number' && Number.isInteger(o.growth) && o.growth >= 0 && o.growth <= 4) out.growth = o.growth;
  if (typeof o.watered === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.watered)) out.watered = o.watered;
  return out;
}

/** What I can do with a thing, as the label on the action button. */
export function actionFor(item: PlacedItem, holding: string | null, watered: boolean): string | null {
  switch (item.kind) {
    case 'light':
      return isOn(item) ? `Turn off ${item.label.toLowerCase()}` : `Turn on ${item.label.toLowerCase()}`;
    case 'door':
      return isOpen(item) ? `Close ${item.label.toLowerCase()}` : `Open ${item.label.toLowerCase()}`;
    case 'tv':
      return isOn(item) ? 'Turn off the TV' : 'Watch our memories';
    case 'frame':
      return 'Change the photo';
    case 'carry':
      return holding ? null : `Pick up ${item.label.toLowerCase()}`;
    case 'stove':
      return 'Cook';
    case 'plant':
      if (holding !== 'watering_can') return null;
      return watered ? null : 'Water the plant';
    case 'furniture':
      return item.seats?.length ? (item.seats[0]!.lie ? `Lie on the ${item.label.toLowerCase()}` : `Sit on the ${item.label.toLowerCase()}`) : null;
  }
}

/** Avatar looks, chosen per person and saved as avatar:<user id>. */
export const SKINS = ['#F2C9A8', '#E8B48F', '#C98E66', '#A26B48', '#7A4B30', '#5A3522'];
export const HAIRS = ['#1E1612', '#3B2416', '#6B4423', '#A8743A', '#D9B26B', '#B8432F', '#8A8A8A', '#E5E5E5'];
export const SHIRTS = ['#D94F70', '#3E8E8A', '#4E6E8E', '#E3A13B', '#6B4E8E', '#F4F1EA', '#2E2E38', '#7C9A3A'];
export const PANTS = ['#33415C', '#2E2E38', '#6B5A45', '#4F6D4A', '#8E8E99', '#B5524A'];

/** How the real skin texture is tinted for each skin tone above (it's the light one; tinting can only darken). */
export const SKIN_TINTS = ['#FFFFFF', '#F2DCCB', '#D6A98A', '#AF7F5E', '#86593E', '#5E3D2A'];
/** The hairstyles on the real bodies (scripts/blender/build_characters.py). */
export const HAIRSTYLES = ['Hair_SimpleParted', 'Hair_Long', 'Hair_Buns', 'Hair_Buzzed', 'Hair_BuzzedFemale'] as const;
export const HAIRSTYLE_LABEL: Record<(typeof HAIRSTYLES)[number], string> = {
  Hair_SimpleParted: 'Parted',
  Hair_Long: 'Long',
  Hair_Buns: 'Buns',
  Hair_Buzzed: 'Short',
  Hair_BuzzedFemale: 'Cropped',
};
export const SHOES = ['#F2F0EA', '#2E2E38', '#6B4423', '#B5524A', '#4E6E8E'];

export interface LookState {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  /** The real person: which body, hairstyle, a beard, shoes. Older looks have none of these. */
  body?: 'm' | 'f';
  style?: (typeof HAIRSTYLES)[number];
  beard?: boolean;
  shoes?: string;
}

export const avatarKey = (userId: string) => `avatar:${userId.toLowerCase()}`;

export function cleanLook(s: unknown): LookState | null {
  const o = s as Partial<LookState> | null;
  const ok = (v: unknown, list: string[]) => typeof v === 'string' && list.includes(v);
  if (!o || !ok(o.skin, SKINS) || !ok(o.hair, HAIRS) || !ok(o.shirt, SHIRTS) || !ok(o.pants, PANTS)) return null;
  const out: LookState = { skin: o.skin!, hair: o.hair!, shirt: o.shirt!, pants: o.pants! };
  if (o.body === 'm' || o.body === 'f') out.body = o.body;
  if (HAIRSTYLES.includes(o.style as (typeof HAIRSTYLES)[number])) out.style = o.style;
  if (typeof o.beard === 'boolean') out.beard = o.beard;
  if (ok(o.shoes, SHOES)) out.shoes = o.shoes;
  return out;
}

/** Day or night, for both of us. */
export const SKY_KEY = 'sky';
/** The speaker: playing, and since when (so we both hear the same bar). */
export const MUSIC_KEY = 'music';
/** A note left on the fridge for the other to find. */
export const NOTE_KEY = 'note';
export const NOTE_MAX = 280;
/** A dish on the table, after cooking. */
export const DISH_KEY = 'dish';
