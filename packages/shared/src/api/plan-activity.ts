import type { Expense, LaborEntry, ListItem } from '../database.types';
import { EXPENSE_CATEGORIES, formatMoney } from './plan';
import { LISTS } from './together';

export interface PlanActivity {
  id: string;
  /** Who did it: me or my partner. */
  mine: boolean;
  text: string;
  at: string;
}

/**
 * The newest few things either of you did across Plan, as one feed: list
 * items added or ticked, costs logged, chores noticed.
 */
export function planActivity(
  ctx: { me: { id: string }; partner: { id: string; display_name: string } },
  data: { items?: ListItem[]; expenses?: Expense[]; labor?: LaborEntry[] },
  limit = 4,
): PlanActivity[] {
  const who = (id: string | null) => (id === ctx.me.id ? 'You' : ctx.partner.display_name);
  const out: PlanActivity[] = [];
  for (const i of data.items ?? []) {
    const list = LISTS[i.list]?.title ?? 'a list';
    if (i.done_at && i.done_by) out.push({ id: `done-${i.id}`, mine: i.done_by === ctx.me.id, text: `${who(i.done_by)} ticked “${i.text}” off ${list}`, at: i.done_at });
    else if (i.added_by) out.push({ id: `add-${i.id}`, mine: i.added_by === ctx.me.id, text: `${who(i.added_by)} added “${i.text}” to ${list}`, at: i.created_at });
  }
  for (const e of data.expenses ?? []) {
    const what = e.is_settlement ? 'paid back' : `paid ${formatMoney(e.amount_cents, e.currency)} for ${e.category ? EXPENSE_CATEGORIES[e.category].label.toLowerCase() : `“${e.description}”`}`;
    out.push({
      id: `exp-${e.id}`,
      mine: e.paid_by === ctx.me.id,
      text: e.is_settlement ? `${who(e.paid_by)} ${what} ${formatMoney(e.amount_cents, e.currency)}` : `${who(e.paid_by)} ${what}`,
      at: e.created_at,
    });
  }
  for (const l of data.labor ?? []) out.push({ id: `lab-${l.id}`, mine: l.done_by === ctx.me.id, text: `${who(l.done_by)}: ${l.task}`, at: l.created_at });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** "now", "5m", "3h", "Yesterday", "4d", "12 Nov". */
export function shortAgo(iso: string, now = new Date()): string {
  const s = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 2 * 86_400) return 'Yesterday';
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
