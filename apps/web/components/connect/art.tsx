/** Connect's small pictures: the two of us, a canvas, a guess bubble, stars. */

export const ME = { fill: '#FF86A3', blush: '#F5547C' };
export const THEM = { fill: '#50CBB9', blush: '#FF86A3' };

/** One of us: pink is me, teal my partner. `o` is a little gasp. */
export function Blob({ fill, blush, size, mood = 'smile' }: { fill: string; blush: string; size: number; mood?: 'smile' | 'o' }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 60 60" fill="none">
      <circle cx="30" cy="30" r="26" fill={fill} />
      <ellipse cx="22" cy="16" rx="9" ry="5" fill="#fff" opacity=".35" />
      <circle cx="22" cy="29" r="3.4" fill="#241933" />
      <circle cx="38" cy="29" r="3.4" fill="#241933" />
      <ellipse cx="15" cy="37" rx="4.5" ry="2.6" fill={blush} opacity=".55" />
      <ellipse cx="45" cy="37" rx="4.5" ry="2.6" fill={blush} opacity=".55" />
      {mood === 'o' ? <ellipse cx="30" cy="40" rx="2.6" ry="3.2" fill="#241933" /> : <path d="M25 38 q5 5 10 0" stroke="#241933" strokeWidth="2.6" strokeLinecap="round" />}
    </svg>
  );
}

/** Draw together: a little canvas with a squiggle and a pencil. */
export function CanvasArt() {
  return (
    <svg aria-hidden width="84" height="72" viewBox="0 0 84 72">
      <rect x="4" y="6" width="64" height="54" rx="8" fill="#fff" />
      <path d="M14 46c6-18 12-20 16-10s10 8 14-14" stroke="#E2336A" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="54" cy="44" r="5" fill="#1BAE9C" />
      <path d="M58 64l18-18-5-5-18 18-2 7z" fill="#FCC24F" stroke="#AE6F08" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Draw & Guess: a speech bubble with a question in it. */
export function GuessArt() {
  return (
    <svg aria-hidden width="72" height="72" viewBox="0 0 72 72">
      <path d="M8 10h56a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H30l-14 12V52H8a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6z" fill="#fff" />
      <path d="M28 26a8 8 0 1 1 11 7.4c-1.6.7-3 2-3 3.8V39M36 45h.01" stroke="#D88C0C" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const STAR = 'M13 2l3.3 6.7 7.4 1.1-5.4 5.2 1.3 7.4L13 19l-6.6 3.4 1.3-7.4-5.4-5.2 7.4-1.1z';

/** Rate it: three stars, the last one still empty. */
export function StarsArt() {
  return (
    <svg aria-hidden width="78" height="26" viewBox="0 0 78 26">
      <path d={STAR} fill="#F3A823" />
      <path d={STAR} fill="#F3A823" transform="translate(26 0)" />
      <path d={STAR} fill="#fff" stroke="#F3A823" strokeWidth="1.6" transform="translate(52 0)" />
    </svg>
  );
}
