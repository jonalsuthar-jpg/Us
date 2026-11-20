/**
 * A call started from somewhere that wants to stay on screen (Our House's
 * Talk button): the call screen starts minimised, as its small bar.
 */
const listeners = new Set<() => void>();

export function minimiseCallScreen() {
  for (const fn of [...listeners]) fn();
}

export function onMinimiseCallScreen(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
