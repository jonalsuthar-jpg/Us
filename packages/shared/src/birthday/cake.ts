/**
 * Cutting the birthday cake together on a call. Either of us drags the knife;
 * both screens follow. Nothing is stored: it travels over the couple channel
 * like talk cards do.
 */
export interface CakeState {
  /** 0 → 1, how far the knife has gone through. */
  knife: number;
  /** Cut all the way: confetti on both screens. */
  cut: boolean;
}

export interface CakeEvent {
  from: string;
  /** null puts the cake away. */
  cake: CakeState | null;
}

/** Past this, the knife finishes the cut by itself. */
export const CAKE_CUT_AT = 0.92;

export function moveKnife(cake: CakeState, knife: number): CakeState {
  if (cake.cut) return cake;
  const k = Math.max(cake.knife, Math.min(1, Math.max(0, knife)));
  return k >= CAKE_CUT_AT ? { knife: 1, cut: true } : { knife: k, cut: false };
}
