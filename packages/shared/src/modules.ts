/**
 * The app's five areas. Both apps build their navigation and the Phase 3–6
 * placeholder screens from this list so the roadmap lives in one place.
 */
export type ModuleId = 'talk' | 'connect' | 'plan' | 'memory' | 'growth';

export interface Feature {
  title: string;
  blurb: string;
  privacy: 'shared' | 'private' | 'private-until-reveal';
  /** Not built yet, in a module that is otherwise live. */
  soon?: boolean;
}

export interface AppModule {
  id: ModuleId;
  title: string;
  /** A line in the display serif, shown on the module's hero. */
  tagline: string;
  phase: number;
  status: 'live' | 'planned';
  features: Feature[];
}

/** Live things to do together on Connect that are still to come, after Listen and Watch. */
export const TOGETHER_SOON: { id: 'draw' | 'games' | 'read'; title: string; blurb: string; short: string }[] = [
  { id: 'draw', title: 'Draw together', blurb: 'One live canvas, two pens. Keep the best ones in Memories.', short: 'One canvas, two pens' },
  {
    id: 'games',
    title: 'Couple games',
    blurb: 'How well do you know me, Would you rather, This or that. Answers revealed together.',
    short: 'Quizzes revealed together',
  },
  { id: 'read', title: 'Read together', blurb: 'A short story or a poem, one shared page, highlights you both see.', short: 'One page, shared highlights' },
];

export const MODULES: AppModule[] = [
  {
    id: 'talk',
    title: 'Talk',
    tagline: 'Voice, face, and every little message in between.',
    phase: 2,
    status: 'live',
    features: [
      { title: 'Calls', blurb: 'Video and voice, peer to peer.', privacy: 'shared' },
      { title: 'Screen sharing', blurb: 'From the web app.', privacy: 'shared' },
      { title: 'Chat', blurb: 'With receipts and typing.', privacy: 'shared' },
    ],
  },
  {
    id: 'connect',
    title: 'Connect',
    tagline: 'Say the hard things softly, and the sweet things often.',
    phase: 3,
    status: 'live',
    features: [
      {
        title: 'Daily Question',
        blurb: 'One prompt a day. Answers stay hidden until you’ve both replied.',
        privacy: 'private-until-reveal',
      },
      {
        title: 'Fight Translator',
        blurb: 'Each of you writes privately. Underneath, a need — revealed only once you’ve both written, after a breath.',
        privacy: 'private-until-reveal',
        soon: true,
      },
      {
        title: 'Future Letters',
        blurb: 'Write now, sealed until a date or a milestone you choose.',
        privacy: 'private-until-reveal',
        soon: true,
      },
      { title: 'Inside Jokes', blurb: 'A dictionary of only-you-two moments, resurfaced now and then.', privacy: 'shared', soon: true },
    ],
  },
  {
    id: 'plan',
    title: 'Plan',
    tagline: 'The logistics of a life together, held lightly.',
    phase: 4,
    status: 'live',
    features: [
      { title: 'Shared calendar', blurb: 'Dates, trips, and the dentist.', privacy: 'shared' },
      { title: 'Decision picker', blurb: 'Can’t choose dinner? Let it choose — fairly.', privacy: 'shared' },
      {
        title: 'Invisible labour',
        blurb: 'Noticing what each of you carries. A balance, never a scoreboard.',
        privacy: 'shared',
      },
      { title: 'Shared costs', blurb: 'Split what’s yours together.', privacy: 'shared' },
    ],
  },
  {
    id: 'memory',
    title: 'Memory',
    tagline: 'Keep the small moments that turned out to be big ones.',
    phase: 5,
    status: 'live',
    features: [
      { title: 'Timeline', blurb: 'Moments, with photos.', privacy: 'shared' },
      { title: 'On this day', blurb: 'A gentle tap from the past.', privacy: 'shared' },
      { title: 'Trips & dates', blurb: 'Where you went — and private notes on how it felt.', privacy: 'private' },
    ],
  },
  {
    id: 'growth',
    title: 'Growth',
    tagline: 'Growing up, together and apart.',
    phase: 6,
    status: 'live',
    features: [
      { title: 'Goals', blurb: 'Yours, theirs, and ours.', privacy: 'shared' },
      {
        title: 'Mood check-ins',
        blurb: 'Only you see your notes. Your partner can get a soft nudge — never the details.',
        privacy: 'private',
      },
      { title: 'Worry space', blurb: 'Private by default. Share only if and when you want.', privacy: 'private' },
      { title: 'Love languages', blurb: 'A quiz, and the occasional gentle idea.', privacy: 'private' },
    ],
  },
];

export const moduleById = (id: ModuleId) => MODULES.find((m) => m.id === id)!;
