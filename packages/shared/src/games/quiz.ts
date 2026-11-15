/**
 * Couple quizzes: one round of each a day (todays_quizzes in
 * 20261115000000_daily_quizzes.sql). The questions live in the database
 * (quiz_questions) and come with each round as `items`. Picks are numbers
 * (quiz_answers.answers):
 *
 *   know_me       option index. The subject answers about themselves, the other guesses.
 *   this_or_that  option index, 0 or 1. We both pick, and see how often we agree.
 *   most_likely   0 = me, 1 = my partner, from whoever is answering.
 *   rate_it       a score, 1–10. Within a point counts as agreeing.
 */

export type QuizKind = 'know_me' | 'this_or_that' | 'most_likely' | 'rate_it';

/** A question as a round carries it. */
export interface QuizItem {
  id: string;
  /** Know me: about the subject, with {name}. Most likely: the end of "Who's more likely to…". Rate it: the thing. */
  prompt: string | null;
  options: string[];
}

/** In the order Connect shows them. */
export const QUIZ_KINDS: QuizKind[] = ['this_or_that', 'know_me', 'most_likely', 'rate_it'];

export const QUIZ_INFO: Record<QuizKind, { title: string; blurb: string; emoji: string }> = {
  this_or_that: { title: 'This or that', blurb: '8 quick picks', emoji: '⚖️' },
  know_me: { title: 'Know me', blurb: 'One answers, one guesses', emoji: '🔍' },
  most_likely: { title: 'Who’s more likely', blurb: 'Point at one of you', emoji: '👉' },
  rate_it: { title: 'Rate it together', blurb: 'Score 8 things, 1 to 10', emoji: '⭐' },
};

/** A know-me question worded for whoever reads it: "Your dream holiday?" or "Parul's dream holiday?". */
export function knowMePrompt(prompt: string, subjectName: string, iAmSubject: boolean): string {
  if (!iAmSubject) return prompt.replace(/\{name\}/g, subjectName);
  const text = prompt
    .replace(/\{name\}'s/g, 'your')
    .replace(/\b(does|is|was|has) \{name\}/g, (_, verb: string) => `${{ does: 'do', is: 'are', was: 'were', has: 'have' }[verb]} you`)
    .replace(/\{name\} (is|was|has|does)\b/g, (_, verb: string) => `you ${{ is: 'are', was: 'were', has: 'have', does: 'do' }[verb]}`)
    .replace(/\{name\}/g, 'you')
    .replace(/they are/g, 'you are')
    .replace(/they were/g, 'you were')
    .replace(/they have/g, 'you have')
    .replace(/\btheir\b/g, 'your')
    .replace(/\bthemselves\b/g, 'yourself')
    .replace(/\bthem\b/g, 'you')
    .replace(/\bthey\b/g, 'you');
  return text[0]!.toUpperCase() + text.slice(1);
}

export const mostLikelyPrompt = (prompt: string) => `Who’s more likely to ${prompt}?`;

/** Rate it: within a point of each other counts as agreeing. */
const CLOSE = 1;

/**
 * Per question, whether we matched: guessed right (know me), picked the same
 * (this or that), pointed at the same person (most likely), rated within a
 * point (rate it).
 */
export function quizMatches(kind: QuizKind, a: number[] | null | undefined, b: number[] | null | undefined): boolean[] {
  if (!a || !b) return [];
  return a.map((x, i) => {
    const y = b[i];
    if (y === undefined) return false;
    // Most likely: each of us answers "me" or "my partner", so agreeing means opposite numbers.
    if (kind === 'most_likely') return x !== y;
    if (kind === 'rate_it') return Math.abs(x - y) <= CLOSE;
    return x === y;
  });
}

export const quizScore = (kind: QuizKind, a: number[] | null | undefined, b: number[] | null | undefined): number =>
  quizMatches(kind, a, b).filter(Boolean).length;

/** Rate it: how far apart we were on average, to one decimal. */
export function rateGap(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const total = a.reduce((n, x, i) => n + Math.abs(x - (b[i] ?? x)), 0);
  return Math.round((total / a.length) * 10) / 10;
}

export function quizVerdict(kind: QuizKind, score: number, total: number): string {
  const r = total ? score / total : 0;
  const pick = (top: string, high: string, mid: string, low: string) => (r >= 0.9 ? top : r >= 0.7 ? high : r >= 0.4 ? mid : low);
  switch (kind) {
    case 'this_or_that':
      return pick('Same brain 🧠', 'Two peas in a pod 🫛', 'Opposites with overlap ✨', 'Opposites attract 🧲');
    case 'most_likely':
      return pick('Totally on the same page 📖', 'You know us well 😌', 'Some debate needed 🤔', 'Let’s talk about this 😂');
    case 'rate_it':
      return pick('Same taste 🤝', 'Pretty in sync 🎶', 'A few taste gaps 🍕', 'Opposite tastes 🌶️');
    default:
      return pick('Soulmates 💞', 'You really know them 😍', 'Getting there 🙂', 'Date night needed 😅');
  }
}
