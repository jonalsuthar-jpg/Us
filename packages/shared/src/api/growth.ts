import type { Goal, Json, LoveLanguage, LoveLanguageResult, MoodCheckin, Worry } from '../database.types';
import type { UsClient } from '../supabase';
import { notifyPartner } from './push';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ----------------------------------------------------------------- goals ---

export async function listGoals(sb: UsClient, coupleId: string): Promise<Goal[]> {
  return unwrap(await sb.from('goals').select('*').eq('couple_id', coupleId).order('created_at'));
}

export async function addGoal(sb: UsClient, row: { couple_id: string; owner_id: string | null; title: string }): Promise<Goal> {
  return unwrap(await sb.from('goals').insert(row).select('*').single());
}

export async function updateGoal(sb: UsClient, id: string, patch: { title?: string; progress?: number }): Promise<void> {
  unwrap(await sb.from('goals').update(patch).eq('id', id));
}

export async function deleteGoal(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('goals').delete().eq('id', id));
}

/** Split the board into mine / theirs / ours. */
export function goalColumns(goals: Goal[], myId: string) {
  return {
    mine: goals.filter((g) => g.owner_id === myId),
    theirs: goals.filter((g) => g.owner_id !== null && g.owner_id !== myId),
    ours: goals.filter((g) => g.owner_id === null),
  };
}

// ------------------------------------------------------------------ mood ---

export const MOODS = [
  { score: 1, label: 'Heavy' },
  { score: 2, label: 'Low' },
  { score: 3, label: 'Okay' },
  { score: 4, label: 'Good' },
  { score: 5, label: 'Bright' },
] as const;

export const moodLabel = (score: number) => MOODS.find((m) => m.score === score)?.label ?? '';

/** My own recent check-ins (RLS: only ever mine). */
export async function listMyMoods(sb: UsClient, limit = 30): Promise<MoodCheckin[]> {
  return unwrap(await sb.from('mood_checkins').select('*').order('created_at', { ascending: false }).limit(limit));
}

/**
 * Save a private check-in. With `nudge`, my partner gets a soft "could use a
 * little care" push and card — the score and note never leave this row.
 */
export async function addMood(
  sb: UsClient,
  row: { owner_id: string; score: number; note: string | null; nudge: boolean },
): Promise<MoodCheckin> {
  const saved = unwrap<MoodCheckin>(
    await sb
      .from('mood_checkins')
      .insert({ owner_id: row.owner_id, score: row.score, note: row.note, nudge_partner: row.nudge })
      .select('*')
      .single(),
  );
  if (row.nudge) void notifyPartner(sb, { category: 'wellbeing_nudge', checkinId: saved.id });
  return saved;
}

export async function deleteMood(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('mood_checkins').delete().eq('id', id));
}

/** When my partner recently asked for a little care. Timestamps only. */
export async function partnerNudges(sb: UsClient, hours = 48): Promise<string[]> {
  const rows = unwrap(await sb.rpc('partner_nudges', { p_hours: hours }));
  return rows.map((r) => r.nudged_at);
}

// ---------------------------------------------------------- worry space ---

/** My worries plus any my partner chose to share with me (RLS decides). */
export async function listWorries(sb: UsClient): Promise<Worry[]> {
  return unwrap(await sb.from('insecurity_checkins').select('*').order('created_at', { ascending: false }).limit(100));
}

export async function addWorry(sb: UsClient, row: { owner_id: string; body: string }): Promise<Worry> {
  return unwrap(await sb.from('insecurity_checkins').insert(row).select('*').single());
}

export async function setWorryShared(sb: UsClient, id: string, shared: boolean): Promise<void> {
  unwrap(await sb.from('insecurity_checkins').update({ shared_at: shared ? new Date().toISOString() : null }).eq('id', id));
}

export async function deleteWorry(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('insecurity_checkins').delete().eq('id', id));
}

// --------------------------------------------------------- love languages ---

export const LOVE_LANGUAGES: Record<LoveLanguage, { title: string; blurb: string; ideas: string[] }> = {
  words: {
    title: 'Words',
    blurb: 'Hearing it said — appreciation, encouragement, “I noticed”.',
    ideas: [
      'Send a message that starts with “I love how you…”.',
      'Tell them one specific thing they did this week that mattered.',
      'Leave a note somewhere they’ll find it tomorrow.',
      'Say thank you for something they always do and rarely hear about.',
    ],
  },
  acts: {
    title: 'Acts',
    blurb: 'Help that lightens the load, without being asked.',
    ideas: [
      'Take one chore off their list today — quietly.',
      'Handle the thing they’ve been putting off.',
      'Make the morning easier: coffee, bag packed, keys found.',
      'Ask “what’s one thing I can do for you this week?” and do it.',
    ],
  },
  gifts: {
    title: 'Gifts',
    blurb: 'Small, thoughtful things that say “I was thinking of you”.',
    ideas: [
      'Pick up their favourite snack on the way home.',
      'Save something tiny from today — a ticket, a leaf, a photo — for them.',
      'Order the book they mentioned weeks ago.',
      'Bring back something small from wherever you go.',
    ],
  },
  time: {
    title: 'Time',
    blurb: 'Undivided attention — phones away, just the two of you.',
    ideas: [
      'Plan twenty phone-free minutes tonight, just to talk.',
      'Take a walk together with no destination.',
      'Cook something together instead of for each other.',
      'Put a date in the calendar — and protect it.',
    ],
  },
  touch: {
    title: 'Touch',
    blurb: 'Closeness — a hand held, a long hug, sitting near.',
    ideas: [
      'Hug for a full twenty seconds today.',
      'Hold hands on the walk or the sofa.',
      'Offer a shoulder rub at the end of the day.',
      'Sit close when you watch something tonight.',
    ],
  },
};

/** One choice per question; each language appears in exactly four, so the quiz is balanced. */
export const LOVE_LANGUAGE_QUIZ: { a: { text: string; lang: LoveLanguage }; b: { text: string; lang: LoveLanguage } }[] = [
  { a: { text: 'They tell me what they love about me', lang: 'words' }, b: { text: 'They take a job off my plate', lang: 'acts' } },
  { a: { text: 'They bring me a little surprise', lang: 'gifts' }, b: { text: 'We spend an evening with no phones', lang: 'time' } },
  { a: { text: 'They hold my hand while we walk', lang: 'touch' }, b: { text: 'They leave me a sweet note', lang: 'words' } },
  { a: { text: 'They fix the thing that was bugging me', lang: 'acts' }, b: { text: 'They remember something I mentioned and get it', lang: 'gifts' } },
  { a: { text: 'They really listen, all attention on me', lang: 'time' }, b: { text: 'A long hug when I get home', lang: 'touch' } },
  { a: { text: 'They say they’re proud of me', lang: 'words' }, b: { text: 'They plan a day just for us', lang: 'time' } },
  { a: { text: 'They make dinner when I’m tired', lang: 'acts' }, b: { text: 'They sit close to me on the sofa', lang: 'touch' } },
  { a: { text: 'A thoughtful gift for no reason', lang: 'gifts' }, b: { text: 'They tell me I did something well', lang: 'words' } },
  { a: { text: 'We go for a walk together', lang: 'time' }, b: { text: 'They run an errand for me', lang: 'acts' } },
  { a: { text: 'A back rub after a long day', lang: 'touch' }, b: { text: 'They bring back something from their trip for me', lang: 'gifts' } },
];

const ORDER: LoveLanguage[] = ['words', 'acts', 'gifts', 'time', 'touch'];

/** Tally answers ('a' | 'b' per question). Ties go to the earlier language in a fixed order. */
export function scoreLoveLanguages(answers: ('a' | 'b')[]): { scores: Record<LoveLanguage, number>; primary: LoveLanguage } {
  const scores = Object.fromEntries(ORDER.map((l) => [l, 0])) as Record<LoveLanguage, number>;
  answers.forEach((pick, i) => {
    const q = LOVE_LANGUAGE_QUIZ[i];
    if (q) scores[q[pick].lang]++;
  });
  const primary = ORDER.reduce((best, l) => (scores[l] > scores[best] ? l : best), ORDER[0]!);
  return { scores, primary };
}

export function rankedLanguages(scores: Json): LoveLanguage[] {
  const s = (scores ?? {}) as Partial<Record<LoveLanguage, number>>;
  return [...ORDER].sort((x, y) => (s[y] ?? 0) - (s[x] ?? 0) || ORDER.indexOf(x) - ORDER.indexOf(y));
}

/** A different gentle idea each day, stable within the day. */
export function ideaOfTheDay(lang: LoveLanguage, now = new Date()): string {
  const ideas = LOVE_LANGUAGES[lang].ideas;
  const day = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86_400_000);
  return ideas[day % ideas.length]!;
}

export async function loveLanguageResults(
  sb: UsClient,
  myId: string,
): Promise<{ mine: LoveLanguageResult | null; partner: LoveLanguageResult | null }> {
  // RLS returns mine plus my partner's only if they shared it.
  const rows = unwrap(await sb.from('love_language_results').select('*'));
  return { mine: rows.find((r) => r.owner_id === myId) ?? null, partner: rows.find((r) => r.owner_id !== myId) ?? null };
}

export async function saveLoveLanguage(
  sb: UsClient,
  row: { owner_id: string; scores: Record<LoveLanguage, number>; primary_language: LoveLanguage; shared: boolean },
): Promise<void> {
  unwrap(
    await sb
      .from('love_language_results')
      .upsert({ ...row, taken_at: new Date().toISOString() }, { onConflict: 'owner_id' }),
  );
}

export async function setLoveLanguageShared(sb: UsClient, ownerId: string, shared: boolean): Promise<void> {
  unwrap(await sb.from('love_language_results').update({ shared }).eq('owner_id', ownerId));
}
