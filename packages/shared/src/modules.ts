/**
 * The app's four areas. Both apps build their navigation and the Phase 3–6
 * placeholder screens from this list so the roadmap lives in one place.
 */
export type ModuleId = 'talk' | 'connect' | 'plan' | 'memory';

export interface Feature {
  title: string;
  blurb: string;
  privacy: 'shared' | 'private' | 'private-until-reveal';
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
];

export const moduleById = (id: ModuleId) => MODULES.find((m) => m.id === id)!;
