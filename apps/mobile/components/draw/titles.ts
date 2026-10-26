import type { Drawing } from '@us/shared';

/** What to call a drawing in lists. */
export function drawingTitle(d: Drawing, partnerId: string, partnerName: string): string {
  if (d.title) return d.title;
  if (d.kind === 'doodle') return d.created_by === partnerId ? `Doodle · ${partnerName}` : `Doodle for ${partnerName}`;
  if (d.kind === 'daily') return `Daily · “${d.prompt ?? 'doodle'}”`;
  if (d.kind === 'guess') return 'Draw & Guess';
  return 'Drawn together';
}
