/**
 * Couple quizzes. "How well do you know me": one of us answers about
 * themselves, the other guesses. "This or that": we both pick, and see how
 * often we agree. Questions are referred to by id (quiz_rounds.questions),
 * picks by option index (quiz_answers.answers).
 */

export type QuizKind = 'know_me' | 'this_or_that';

export interface KnowMeQuestion {
  id: string;
  /** About the subject, with {name} for them: "{name}'s dream holiday?" */
  q: string;
  options: string[];
}

export interface ThisOrThat {
  id: string;
  options: [string, string];
}

export const QUIZ_LENGTH = 10;

const k = (id: string, q: string, ...options: string[]): KnowMeQuestion => ({ id, q, options });

export const KNOW_ME: KnowMeQuestion[] = [
  k('k01', "{name}'s perfect Sunday?", 'Sleeping in', 'Out with friends', 'Cooking at home', 'A trip somewhere new'),
  k('k02', "{name}'s go-to comfort food?", 'Something spicy', 'Pizza or pasta', 'Ice cream', 'Home-cooked dal chawal'),
  k('k03', 'What would {name} grab first in a fire?', 'Phone', 'Photos', 'Wallet and documents', 'A favourite thing from childhood'),
  k('k04', "{name}'s dream holiday?", 'Beach and sun', 'Snowy mountains', 'A big city', 'Somewhere wild and quiet'),
  k('k05', "{name}'s biggest pet peeve?", 'Being late', 'Loud chewing', 'Mess', 'Being ignored'),
  k('k06', 'How does {name} like to say sorry?', 'With words', 'With a hug', 'With a small gift', 'By doing something kind'),
  k('k07', "{name}'s love language?", 'Words', 'Time together', 'Touch', 'Gifts', 'Doing things for me'),
  k('k08', "{name}'s secret talent?", 'Cooking', 'Singing', 'Making people laugh', 'Remembering everything'),
  k('k09', 'When {name} is stressed, they…', 'Go quiet', 'Talk it out', 'Clean or organise', 'Eat snacks'),
  k('k10', "{name}'s ideal date?", 'Dinner out', 'Movie night in', 'A long walk', 'Trying something new'),
  k('k11', "{name}'s morning drink?", 'Chai', 'Coffee', 'Just water', 'Juice or a smoothie'),
  k('k12', "{name}'s favourite season?", 'Summer', 'Monsoon', 'Autumn', 'Winter'),
  k('k13', 'What scares {name} most?', 'Heights', 'Spiders and bugs', 'Being alone', 'Public speaking'),
  k('k14', "{name}'s dream job, if money didn't matter?", 'Travel the world', 'Something creative', 'Run a café', 'Help people'),
  k('k15', 'What does {name} do first after waking up?', 'Check the phone', 'Stretch', 'Brush teeth', 'Snooze again'),
  k('k16', "{name}'s favourite way to relax?", 'Music', 'A show or movie', 'A nap', 'A walk outside'),
  k('k17', 'How would {name} spend a surprise ₹10,000?', 'Save it', 'Food', 'Clothes or shopping', 'A trip'),
  k('k18', "{name}'s party style?", 'Life of the party', 'Small group in a corner', 'DJ / music person', 'Leaves early'),
  k('k19', 'What makes {name} laugh the most?', 'Silly memes', 'My jokes', 'Funny videos', 'Embarrassing stories'),
  k('k20', "{name}'s superpower of choice?", 'Teleporting', 'Reading minds', 'Flying', 'Stopping time'),
  k('k21', "{name}'s ideal pet?", 'Dog', 'Cat', 'Something unusual', 'No pets, thanks'),
  k('k22', 'What would {name} cook to impress?', 'A family recipe', 'Pasta', 'A dessert', 'Order in and pretend'),
  k('k23', "{name}'s texting style?", 'Long paragraphs', 'Many short messages', 'Voice notes', 'Mostly emojis and memes'),
  k('k24', "{name}'s guilty pleasure?", 'Reality TV', 'Junk food', 'Online shopping', 'Sleeping all day'),
  k('k25', "{name}'s dream home?", 'City flat with a view', 'House with a garden', 'By the sea', 'In the hills'),
  k('k26', 'What does {name} miss most from childhood?', 'No responsibilities', 'Summer holidays', 'Family all together', 'School friends'),
  k('k27', "{name}'s movie pick?", 'Comedy', 'Romance', 'Thriller or horror', 'Action'),
  k('k28', "{name}'s shopping style?", 'Plans and compares', 'Buys on impulse', 'Hates shopping', 'Only in sales'),
  k('k29', 'What would {name} change about their day?', 'More sleep', 'Less work', 'More time with me', 'More time alone'),
  k('k30', "{name}'s travel style?", 'Every minute planned', 'Go with the flow', 'Food tour', 'Lie by the pool'),
  k('k31', 'How does {name} take care of me when I am sick?', 'Brings food and medicine', 'Lots of check-in texts', 'Cuddles and shows', 'Gives me space'),
  k('k32', "{name}'s favourite time of day?", 'Early morning', 'Afternoon', 'Evening', 'Late night'),
  k('k33', 'What would {name} rather receive?', 'A handwritten letter', 'Flowers', 'Something practical', 'A surprise plan'),
  k('k34', "{name}'s biggest dream?", 'A family', 'Seeing the world', 'Success at work', 'A peaceful, simple life'),
  k('k35', "{name}'s sweet or savoury?", 'Always sweet', 'Always savoury', 'Both together', 'Depends on the mood'),
  k('k36', 'What would {name} do on a free day alone?', 'Binge a show', 'Go out and explore', 'Sleep', 'Catch up on chores'),
  k('k37', 'How does {name} handle an argument?', 'Talks right away', 'Needs time first', 'Makes a joke', 'Writes it out'),
  k('k38', "{name}'s favourite thing about us?", 'How we laugh', 'How we talk', 'How we take care of each other', 'Our adventures'),
  k('k39', "{name}'s karaoke song?", 'An old Bollywood classic', 'A pop hit', 'A rock anthem', 'Will never sing'),
  k('k40', 'What does {name} order at a café?', 'Coffee, nothing else', 'Something sweet', 'A sandwich', 'Whatever is new'),
  k('k41', "{name}'s sleep style?", 'Starfish', 'Curled up', 'Steals the blanket', 'Barely moves'),
  k('k42', "{name}'s first reaction to good news?", 'Calls me', 'Screams', 'Tells everyone', 'Quiet smile'),
  k('k43', 'What would {name} name a pet?', 'A food name', 'A human name', 'Something funny', 'A name from a movie'),
  k('k44', "{name}'s hidden soft spot?", 'Babies', 'Animals', 'Old couples', 'Sad movies'),
  k('k45', 'Which chore does {name} hate most?', 'Dishes', 'Laundry', 'Cleaning the bathroom', 'Grocery shopping'),
  k('k46', "{name}'s way to celebrate a birthday?", 'Big party', 'Quiet dinner', 'A trip', 'Forget it ever happened'),
  k('k47', "{name}'s ideal weekend away?", 'Spa and rest', 'Adventure sports', 'Old town and museums', 'Food and markets'),
  k('k48', 'How does {name} show they are happy?', 'Sings or hums', 'Talks a lot', 'Dances', 'Gets extra cuddly'),
  k('k49', "{name}'s favourite memory of us?", 'Our first date', 'A trip together', 'A silly day at home', 'When we first said I love you'),
  k('k50', "{name}'s phone battery is usually…", 'Always charged', 'Around half', 'Red, always', 'Dead by evening'),
];

const t = (id: string, a: string, b: string): ThisOrThat => ({ id, options: [a, b] });

export const THIS_OR_THAT: ThisOrThat[] = [
  t('t01', 'Beach', 'Mountains'), t('t02', 'Chai', 'Coffee'), t('t03', 'Morning', 'Night'), t('t04', 'Cats', 'Dogs'),
  t('t05', 'Movie night in', 'Dinner out'), t('t06', 'Sweet', 'Savoury'), t('t07', 'Texting', 'Calling'), t('t08', 'Summer', 'Winter'),
  t('t09', 'Plan everything', 'Go with the flow'), t('t10', 'Books', 'Movies'), t('t11', 'City', 'Countryside'), t('t12', 'Pizza', 'Biryani'),
  t('t13', 'Sunrise', 'Sunset'), t('t14', 'Road trip', 'Flight'), t('t15', 'Big party', 'Small dinner'), t('t16', 'Comedy', 'Thriller'),
  t('t17', 'Cook together', 'Order in'), t('t18', 'Rain', 'Sunshine'), t('t19', 'Early bird', 'Night owl'), t('t20', 'Hugs', 'Kisses'),
  t('t21', 'Ice cream', 'Chocolate'), t('t22', 'Sneakers', 'Sandals'), t('t23', 'Window seat', 'Aisle seat'), t('t24', 'Gym', 'Yoga'),
  t('t25', 'Old songs', 'New songs'), t('t26', 'Save', 'Spend'), t('t27', 'Spicy', 'Mild'), t('t28', 'Hotel', 'Homestay'),
  t('t29', 'Netflix', 'YouTube'), t('t30', 'Surprise gift', 'Gift you chose'), t('t31', 'Long walk', 'Long drive'), t('t32', 'Tea party', 'Dance party'),
  t('t33', 'Fries', 'Onion rings'), t('t34', 'Big wedding', 'Small wedding'), t('t35', 'Stay in pyjamas', 'Dress up'), t('t36', 'Museum', 'Theme park'),
  t('t37', 'Pancakes', 'Parathas'), t('t38', 'Puzzle', 'Board game'), t('t39', 'Hill station', 'Desert camp'), t('t40', 'Love letter', 'Love song'),
  t('t41', 'Breakfast in bed', 'Brunch out'), t('t42', 'Cold drink', 'Hot drink'), t('t43', 'Mango', 'Strawberry'), t('t44', 'Fiction', 'True stories'),
  t('t45', 'Camping', 'Five-star hotel'), t('t46', 'Street food', 'Fine dining'), t('t47', 'Sing', 'Dance'), t('t48', 'Pool', 'Sea'),
  t('t49', 'Messy and fun', 'Neat and calm'), t('t50', 'Halloween', 'Diwali'), t('t51', 'Selfie', 'Someone else takes it'), t('t52', 'Live concert', 'Stand-up show'),
  t('t53', 'Samosa', 'Momos'), t('t54', 'Stay home on holiday', 'Travel on holiday'), t('t55', 'Paper book', 'E-reader'), t('t56', 'Fast car', 'Slow train'),
  t('t57', 'Sushi', 'Tacos'), t('t58', 'Big city lights', 'Starry sky'), t('t59', 'Cuddle on the couch', 'Go out dancing'), t('t60', 'Plants', 'Pets'),
];

const KNOW_ME_BY_ID = new Map(KNOW_ME.map((x) => [x.id, x]));
const TOT_BY_ID = new Map(THIS_OR_THAT.map((x) => [x.id, x]));

export const knowMeQuestion = (id: string) => KNOW_ME_BY_ID.get(id);
export const thisOrThat = (id: string) => TOT_BY_ID.get(id);

/** The options for a question in a round, whatever its kind. */
export const quizOptions = (kind: QuizKind, id: string): string[] => (kind === 'know_me' ? knowMeQuestion(id)?.options : thisOrThat(id)?.options) ?? [];

/** A know-me question worded for whoever reads it: "Your dream holiday?" or "Parul's dream holiday?". */
export function knowMePrompt(q: KnowMeQuestion, subjectName: string, iAmSubject: boolean): string {
  if (!iAmSubject) return q.q.replace(/\{name\}/g, subjectName);
  const text = q.q
    .replace(/\{name\}'s/g, 'your')
    .replace(/\{name\} is/g, 'you are')
    .replace(/\{name\}/g, 'you')
    .replace(/they are/g, 'you are')
    .replace(/\btheir\b/g, 'your')
    .replace(/\bthey\b/g, 'you');
  return text[0]!.toUpperCase() + text.slice(1);
}

/**
 * QUIZ_LENGTH questions we haven't had yet (the oldest-asked come back once
 * every question has been used).
 */
export function pickQuestions(kind: QuizKind, used: string[], random = Math.random): string[] {
  const pool = (kind === 'know_me' ? KNOW_ME : THIS_OR_THAT).map((x) => x.id);
  const seen = new Set(used);
  let fresh = pool.filter((id) => !seen.has(id));
  if (fresh.length < QUIZ_LENGTH) {
    // Recycle: the least recently used first (`used` is newest first).
    const order = [...new Set(used)].reverse();
    fresh = [...fresh, ...order.filter((id) => pool.includes(id))];
    return shuffle(fresh.slice(0, QUIZ_LENGTH), random);
  }
  return shuffle(fresh, random).slice(0, QUIZ_LENGTH);
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** How many picks match: guesses right (know me) or the same choice (this or that). */
export function quizScore(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b) return 0;
  return a.reduce((n, x, i) => n + (x === b[i] ? 1 : 0), 0);
}

export function quizVerdict(kind: QuizKind, score: number, total: number): string {
  const r = total ? score / total : 0;
  if (kind === 'this_or_that') {
    if (r >= 0.9) return 'Same brain 🧠';
    if (r >= 0.7) return 'Two peas in a pod 🫛';
    if (r >= 0.4) return 'Opposites with overlap ✨';
    return 'Opposites attract 🧲';
  }
  if (r >= 0.9) return 'Soulmates 💞';
  if (r >= 0.7) return 'You really know them 😍';
  if (r >= 0.4) return 'Getting there 🙂';
  return 'Date night needed 😅';
}

export const QUIZ_INFO: Record<QuizKind, { title: string; blurb: string; emoji: string }> = {
  know_me: { title: 'How well do you know me?', blurb: 'One answers, one guesses', emoji: '🔍' },
  this_or_that: { title: 'This or that', blurb: 'See how often you agree', emoji: '⚖️' },
};
