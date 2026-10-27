/**
 * Draw & Guess word packs. Hinglish is in Latin script, the way it's typed.
 * Our own pack (words we add, and our memory titles) is loaded from the
 * database and merged in by pickChoices().
 */
export type Difficulty = 'easy' | 'medium' | 'hard';
export type PackId = 'everyday' | 'bollywood' | 'food' | 'hinglish' | 'ours';

export interface Word {
  text: string;
  pack: PackId;
  level: Difficulty;
}

export const PACKS: { id: PackId; name: string; blurb: string }[] = [
  { id: 'everyday', name: 'Everyday', blurb: 'Things around the house and town' },
  { id: 'bollywood', name: 'Bollywood', blurb: 'Filmi moments everyone knows' },
  { id: 'food', name: 'Food & festivals', blurb: 'Chai to Diwali' },
  { id: 'hinglish', name: 'Hinglish', blurb: 'Jugaad, timepass and more' },
  { id: 'ours', name: 'Ours', blurb: 'Your words and memories' },
];

export const LEVEL_NAME: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const W: Record<Exclude<PackId, 'ours'>, Record<Difficulty, string[]>> = {
  everyday: {
    easy: [
      'Sun', 'House', 'Tree', 'Cat', 'Dog', 'Fish', 'Car', 'Ball', 'Cup', 'Moon', 'Star', 'Flower', 'Apple', 'Book', 'Key',
      'Chair', 'Bed', 'Clock', 'Shoe', 'Hat', 'Umbrella', 'Phone', 'Heart', 'Bird', 'Boat', 'Cloud', 'Rain', 'Door', 'Eye', 'Pen',
    ],
    medium: [
      'Auto rickshaw', 'Bicycle', 'Ceiling fan', 'Toothbrush', 'Pressure cooker', 'Laptop', 'Scooter', 'Rainbow', 'Mountain',
      'Butterfly', 'Snowman', 'Guitar', 'Camera', 'Ladder', 'Kite', 'Pillow', 'Balloon', 'Candle', 'Mirror', 'Bridge',
      'Train', 'Aeroplane', 'Bucket', 'Elephant', 'Peacock', 'Lighthouse', 'Sandcastle', 'Selfie', 'Wifi', 'Alarm',
    ],
    hard: [
      'Traffic jam', 'Power cut', 'Monsoon', 'Lift', 'Queue', 'Haircut', 'Wedding', 'Birthday party', 'Road trip', 'Picnic',
      'Hiccups', 'Sunburn', 'Sleepwalking', 'Long distance', 'Video call', 'Netflix and chill', 'Gym', 'Yoga', 'Moving house',
      'Lost keys', 'First date', 'Honeymoon', 'Overslept', 'Online shopping', 'Group selfie',
    ],
  },
  bollywood: {
    easy: ['Train', 'Rain dance', 'Rose', 'Guitar', 'Mustache', 'Sunglasses', 'Microphone', 'Popcorn', 'Ticket', 'Swing', 'Dupatta', 'Bike'],
    medium: [
      'Villain laugh', 'Slow motion', 'Item song', 'Mother’s tears', 'Wedding song', 'Dream sequence', 'Interval', 'Hero entry',
      'Twins separated', 'Switzerland', 'Mustard field', 'Fight scene', 'Love triangle', 'Arms open wide',
    ],
    hard: [
      'Palat', 'Mogambo', 'Bahubali', 'Sholay', 'DDLJ', 'Kuch Kuch Hota Hai', 'Lagaan', '3 Idiots', 'Dangal', 'Gadar',
      'Dil Chahta Hai', 'Jab We Met', 'Rang De Basanti', 'Zindagi Na Milegi Dobara', 'Chak De',
    ],
  },
  food: {
    easy: ['Chai', 'Samosa', 'Mango', 'Banana', 'Roti', 'Ice cream', 'Laddoo', 'Diya', 'Kite', 'Rangoli', 'Coconut', 'Egg', 'Pizza', 'Cake'],
    medium: [
      'Golgappa', 'Dosa', 'Biryani', 'Jalebi', 'Momos', 'Pav bhaji', 'Vada pav', 'Thali', 'Lassi', 'Kulfi', 'Paratha', 'Idli',
      'Diwali', 'Holi', 'Rakhi', 'Fireworks', 'Mehendi', 'Garba',
    ],
    hard: [
      'Chole bhature', 'Gulab jamun', 'Masala dosa', 'Filter coffee', 'Dabba', 'Karva Chauth', 'Ganesh Chaturthi', 'Durga Puja',
      'Eid', 'Christmas', 'Pongal', 'Onam', 'Lohri', 'Navratri', 'Baraat', 'Sangeet',
    ],
  },
  hinglish: {
    easy: ['Chappal', 'Jhola', 'Chashma', 'Topi', 'Ghadi', 'Kursi', 'Gaadi', 'Patang', 'Billi', 'Kutta', 'Chand', 'Taara'],
    medium: [
      'Timepass', 'Chai pe charcha', 'Mummy ka phone', 'Jugaad', 'Pakka', 'Chill maar', 'Bindaas', 'Dhinchak', 'Nautanki',
      'Kanjoos', 'Gossip aunty', 'Sasural',
    ],
    hard: [
      'Jugaadu', 'Bas kar', 'Arey yaar', 'Kya scene hai', 'Full on', 'Funda', 'Fundae', 'Dimaag ka dahi', 'Ghar ki murgi',
      'Bhai log', 'Shaadi ka laddoo', 'Hawa mein', 'Paisa vasool',
    ],
  },
};

export function packWords(pack: Exclude<PackId, 'ours'>): Word[] {
  const levels = W[pack];
  return (Object.keys(levels) as Difficulty[]).flatMap((level) => levels[level].map((text) => ({ text, pack, level })));
}

export const ALL_WORDS: Word[] = (Object.keys(W) as Exclude<PackId, 'ours'>[]).flatMap(packWords);

/** Our own words: hard if long, medium otherwise. */
export function ourWords(texts: string[]): Word[] {
  const seen = new Set<string>();
  const out: Word[] = [];
  for (const raw of texts) {
    const text = raw.trim().replace(/\s+/g, ' ');
    const key = text.toLowerCase();
    if (!text || text.length > 40 || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, pack: 'ours', level: text.split(' ').length >= 3 ? 'hard' : 'medium' });
  }
  return out;
}

/** A small seeded random, so tests (and both devices) can agree. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

/** The levels offered for each number of choices. */
const LEVELS_FOR: Record<number, Difficulty[]> = {
  1: ['medium'],
  2: ['easy', 'hard'],
  3: ['easy', 'medium', 'hard'],
  4: ['easy', 'medium', 'medium', 'hard'],
  5: ['easy', 'easy', 'medium', 'hard', 'hard'],
};

/**
 * Words to choose from (three by default: an easy, a medium and a hard one)
 * from the chosen packs, never one we've already had this game. When our own
 * pack is on and has words, the last hard choice comes from it.
 */
export function pickChoices(packs: PackId[], ours: Word[], used: string[], rand: () => number = Math.random, count = 3): Word[] {
  const usedSet = new Set(used.map((u) => u.toLowerCase()));
  const pool = [...ALL_WORDS.filter((w) => packs.includes(w.pack)), ...(packs.includes('ours') ? ours : [])].filter(
    (w) => !usedSet.has(w.text.toLowerCase()),
  );
  const fallback = ALL_WORDS.filter((w) => !usedSet.has(w.text.toLowerCase()));
  const levels = LEVELS_FOR[Math.max(1, Math.min(5, Math.round(count)))]!;
  const out: Word[] = [];
  levels.forEach((level, i) => {
    const last = i === levels.length - 1;
    const fromOurs = last && packs.includes('ours') ? pool.filter((w) => w.pack === 'ours') : [];
    const fresh = (list: Word[]) => list.filter((w) => !out.some((o) => o.text === w.text));
    let list = fresh(fromOurs.length ? fromOurs : pool.filter((w) => w.level === level));
    if (!list.length) list = fresh(fallback.filter((x) => x.level === level));
    if (!list.length) list = fresh(fallback);
    const w = list[Math.floor(rand() * list.length)];
    if (w) out.push(w);
  });
  return out;
}
