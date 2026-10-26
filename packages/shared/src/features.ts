/**
 * Everything an admin can grant a couple. Mirrors public.features
 * (supabase/migrations/20261028000000_admin.sql); the database enforces it,
 * the apps use this list to label it and to hide what a couple doesn't have.
 */
export type FeatureKey =
  | 'chat'
  | 'calls'
  | 'snaps'
  | 'taps'
  | 'countdowns'
  | 'location'
  | 'arrival'
  | 'plant'
  | 'spark'
  | 'daily_question'
  | 'fight_translator'
  | 'letters'
  | 'jokes'
  | 'draw'
  | 'calendar'
  | 'lists'
  | 'decide'
  | 'labour'
  | 'costs'
  | 'memories'
  | 'goals'
  | 'mood'
  | 'worries'
  | 'love_languages';

export type FeatureGroup = 'talk' | 'home' | 'connect' | 'plan' | 'memory' | 'growth';

export interface FeatureInfo {
  key: FeatureKey;
  label: string;
  group: FeatureGroup;
}

export const FEATURES: FeatureInfo[] = [
  { key: 'chat', label: 'Chat', group: 'talk' },
  { key: 'calls', label: 'Calls', group: 'talk' },
  { key: 'snaps', label: 'Snaps', group: 'home' },
  { key: 'taps', label: 'Thinking of you', group: 'home' },
  { key: 'countdowns', label: 'Countdowns', group: 'home' },
  { key: 'location', label: 'Location sharing', group: 'home' },
  { key: 'arrival', label: 'Got home safe', group: 'home' },
  { key: 'plant', label: 'Our plant', group: 'home' },
  { key: 'spark', label: 'Spark Rank', group: 'home' },
  { key: 'daily_question', label: 'Daily question', group: 'connect' },
  { key: 'fight_translator', label: 'Fight translator', group: 'connect' },
  { key: 'letters', label: 'Future letters', group: 'connect' },
  { key: 'jokes', label: 'Inside jokes', group: 'connect' },
  { key: 'draw', label: 'Draw together', group: 'connect' },
  { key: 'calendar', label: 'Calendar', group: 'plan' },
  { key: 'lists', label: 'Lists', group: 'plan' },
  { key: 'decide', label: 'Decision picker', group: 'plan' },
  { key: 'labour', label: 'Invisible labour', group: 'plan' },
  { key: 'costs', label: 'Shared costs', group: 'plan' },
  { key: 'memories', label: 'Memories', group: 'memory' },
  { key: 'goals', label: 'Goals', group: 'growth' },
  { key: 'mood', label: 'Mood check-ins', group: 'growth' },
  { key: 'worries', label: 'Worry space', group: 'growth' },
  { key: 'love_languages', label: 'Love languages', group: 'growth' },
];

export const FEATURE_GROUPS: { id: FeatureGroup; title: string }[] = [
  { id: 'talk', title: 'Talk' },
  { id: 'home', title: 'Home' },
  { id: 'connect', title: 'Connect' },
  { id: 'plan', title: 'Plan' },
  { id: 'memory', title: 'Memory' },
  { id: 'growth', title: 'Growth' },
];

export const ALL_FEATURES: FeatureKey[] = FEATURES.map((f) => f.key);

export const featuresIn = (group: FeatureGroup) => FEATURES.filter((f) => f.group === group);

export const featureLabel = (key: string) => FEATURES.find((f) => f.key === key)?.label ?? key;

/** The app tabs, and the features that make each one worth showing. */
export const TAB_FEATURES: Record<'talk' | 'connect' | 'plan' | 'memory' | 'growth', FeatureKey[]> = {
  talk: ['chat', 'calls'],
  connect: ['daily_question', 'calls', 'draw'],
  plan: ['calendar', 'lists', 'decide', 'labour', 'costs'],
  memory: ['memories'],
  growth: ['goals', 'mood', 'worries', 'love_languages'],
};
