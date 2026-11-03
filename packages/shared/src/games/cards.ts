/**
 * Talk cards on calls: either of us opens a deck, and the same card shows on
 * both screens. Nothing is stored; the couple channel carries which deck,
 * the shuffle and which card is up (see CardEvent), so both phones deal the
 * same order from the same seed.
 */

export type DeckId = 'deep' | 'truth_dare' | 'would_you_rather' | 'spicy';

export interface Deck {
  id: DeckId;
  title: string;
  emoji: string;
  /** Spicy is off until one of us opts in on the call. */
  spicy?: boolean;
  cards: string[];
}

export const DECKS: Deck[] = [
  {
    id: 'deep',
    title: 'Deep talk',
    emoji: '🌙',
    cards: [
      'What’s a moment with me you replay in your head?',
      'When did you first know you loved me?',
      'What’s something you’ve never told anyone, that you’d tell me now?',
      'What does home feel like to you?',
      'What’s a dream you’ve quietly given up on? Should you pick it back up?',
      'What do you need more of from me this month?',
      'What’s one thing I do that makes you feel safe?',
      'What are you most proud of that nobody notices?',
      'Where do you see us in five years? Be specific.',
      'What’s a fear you have about us?',
      'Which childhood memory shaped you the most?',
      'What’s the kindest thing someone has done for you?',
      'If we had one whole day with no rules, what would we do?',
      'What’s something you want us to get better at together?',
      'What song reminds you of me, and why?',
      'What’s a small habit of mine you secretly love?',
      'What’s the hardest thing you’ve been through, and what got you through it?',
      'What does a perfect ordinary day with me look like?',
      'What’s one way I’ve changed you?',
      'What tradition do you want us to start?',
      'When do you feel most loved by me?',
      'What would you want our kids, or anyone we raise, to know about us?',
      'What’s something you’re still learning to forgive yourself for?',
      'What does “forever” mean to you?',
      'What made you laugh hardest this year?',
      'What’s one thing on your bucket list we should do together?',
      'What do you think we argue about, really, underneath?',
      'What’s a promise you want to make me tonight?',
      'If you could relive one day of our relationship, which would it be?',
      'What do you admire most about me?',
    ],
  },
  {
    id: 'truth_dare',
    title: 'Truth or dare',
    emoji: '🎲',
    cards: [
      'Truth: what was your first impression of me?',
      'Dare: sing the chorus of the last song you listened to.',
      'Truth: what’s the most embarrassing thing in your search history?',
      'Dare: do your best impression of me.',
      'Truth: who was your first crush?',
      'Dare: show the last photo in your camera roll.',
      'Truth: what’s a lie you told me that I never found out about?',
      'Dare: speak in an accent for the next three cards.',
      'Truth: what’s the weirdest thing you’ve eaten?',
      'Dare: blow me a kiss in the most dramatic way you can.',
      'Truth: what’s one thing you’d change about our first date?',
      'Dare: tell me a joke. If I don’t laugh, do another dare.',
      'Truth: what’s your most irrational fear?',
      'Dare: dance for 20 seconds, no music.',
      'Truth: have you ever stalked an ex online since we got together?',
      'Dare: read the last message you sent someone else, out loud.',
      'Truth: what’s the most childish thing you still do?',
      'Dare: give me a compliment in the style of a poem.',
      'Truth: what do you really think of my cooking?',
      'Dare: make the funniest face you can and hold it for 5 seconds.',
      'Truth: what nickname would you secretly like me to call you?',
      'Dare: tell me three things you love about me, fast.',
      'Truth: when did you last cry, and why?',
      'Dare: do ten jumping jacks while saying my name.',
      'Truth: what’s a habit of mine that annoys you?',
      'Dare: let me pick your phone wallpaper for a day.',
      'Truth: what’s the pettiest thing you’ve ever done?',
      'Dare: serenade me with a made-up love song.',
      'Truth: what were you thinking the first time we kissed?',
      'Dare: send me a voice note right now saying why you miss me.',
    ],
  },
  {
    id: 'would_you_rather',
    title: 'Would you rather',
    emoji: '🤔',
    cards: [
      'Would you rather always know what I’m thinking, or have me always know what you’re thinking?',
      'Would you rather relive our first date, or skip ahead to our 25th anniversary?',
      'Would you rather live by the sea or in the mountains, together forever?',
      'Would you rather have a pet dragon or a pet unicorn?',
      'Would you rather never use your phone again, or never watch TV again?',
      'Would you rather travel the world for a year, or buy our dream home?',
      'Would you rather only eat sweet food or only salty food for a year?',
      'Would you rather be famous together, or rich and unknown together?',
      'Would you rather have breakfast in bed every day, or a surprise date every month?',
      'Would you rather be able to fly or teleport to me?',
      'Would you rather fight one horse-sized duck or a hundred duck-sized horses?',
      'Would you rather read my diary, or have me read yours?',
      'Would you rather have a huge wedding or elope tomorrow?',
      'Would you rather always be 10 minutes late, or 20 minutes early?',
      'Would you rather lose all our photos, or all our messages?',
      'Would you rather live in the past or the future?',
      'Would you rather give up chai/coffee or chocolate forever?',
      'Would you rather sing everything you say, or dance everywhere you go?',
      'Would you rather have a rewind button or a pause button for life?',
      'Would you rather cook every meal, or do every dish?',
      'Would you rather be stuck in a lift with me for a day, or on a desert island for a week?',
      'Would you rather have a song written about us, or a movie made about us?',
      'Would you rather know when you will die, or how?',
      'Would you rather only whisper, or only shout, for a day?',
      'Would you rather have unlimited flights, or unlimited food deliveries?',
    ],
  },
  {
    id: 'spicy',
    title: 'Spicy',
    emoji: '🌶️',
    spicy: true,
    cards: [
      'What’s something I wear that drives you crazy, in a good way?',
      'Describe our perfect night together in three words.',
      'Where’s the most adventurous place you’d want to kiss me?',
      'What’s a compliment about my body you’ve never said out loud?',
      'What was the moment you first wanted to kiss me?',
      'What’s one thing you want me to do more often?',
      'Which of our dates would you call the most romantic?',
      'What’s your favourite way for me to say good morning?',
      'What’s a fantasy date you’ve imagined with me?',
      'What’s the most attractive thing about how I talk?',
      'Tell me something you’re looking forward to next time we’re together.',
      'What song would you put on for a slow dance with me right now?',
      'Where do you like being kissed most?',
      'What’s something about me you noticed and never forgot?',
      'Rate our last kiss out of ten, and say why.',
    ],
  },
];

export const deckById = (id: DeckId) => DECKS.find((d) => d.id === id)!;

/** The same shuffle on both phones: a small seeded generator (mulberry32). */
export function seededOrder(length: number, seed: number): number[] {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const out = Array.from({ length }, (_, i) => i);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** What's on the table: which deck, its shuffle, and the card that's up. */
export interface CardTable {
  deck: DeckId;
  seed: number;
  index: number;
}

/** The card's text, or null past the end of the deck. */
export function cardAt(table: CardTable): string | null {
  const deck = deckById(table.deck);
  const order = seededOrder(deck.cards.length, table.seed);
  const i = order[table.index];
  return i === undefined ? null : deck.cards[i]!;
}

/** Over the couple channel. `table: null` puts the cards away. */
export interface CardEvent {
  from: string;
  table: CardTable | null;
}
