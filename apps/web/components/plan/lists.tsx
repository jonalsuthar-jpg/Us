'use client';

import {
  addListItem,
  clearDoneItems,
  deleteListItem,
  LIST_NAMES,
  LISTS,
  listItems,
  setListItemDone,
  sortListItems,
  type ListName,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Check, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

/** Shared lists: groceries, a bucket list, things to watch and read. Either of you ticks things off. */
export function PlanLists() {
  const { sb, couple, me, partner } = useCouple();
  const items = useCoupleData('plan:lists', () => listItems(sb, couple.id), [sb, couple.id]);
  const [list, setList] = useState<ListName>('groceries');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);

  const all = items.data ?? [];
  const shown = sortListItems(all.filter((i) => i.list === list));
  const meta = LISTS[list];
  const doneCount = shown.filter((i) => i.done_at).length;
  const nameOf = (id: string | null) => (id === me.id ? 'you' : id === partner.id ? partner.display_name : 'someone');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      await items.mutate(() => addListItem(sb, { couple_id: couple.id, list, text, added_by: me.id }));
      setText('');
    } catch (err) {
      fail(err as Error);
    }
  }

  return (
    <div className="space-y-6">
      <Segmented
        label="Which list"
        size="sm"
        options={LIST_NAMES.map((n) => {
          const open = all.filter((i) => i.list === n && !i.done_at).length;
          return { value: n, label: `${LISTS[n].emoji} ${LISTS[n].title}${open ? ` · ${open}` : ''}` };
        })}
        value={list}
        onChange={setList}
        className="w-full overflow-x-auto sm:w-auto"
      />

      <Sheet pad="md" className="space-y-5">
        <form onSubmit={add} className="flex gap-2">
          <label htmlFor="list-add" className="sr-only">
            Add to {meta.title}
          </label>
          <input
            id="list-add"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder={meta.placeholder}
            className="h-11 flex-1 rounded-control border border-paper-edge bg-paper px-4 text-body text-ink placeholder:text-ink-muted/70 focus:border-rose-300 focus:outline-none"
          />
          <Button type="submit" disabled={!text.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
        {error && <ErrorNote>{error}</ErrorNote>}

        {items.loading && !items.data ? (
          <div className="h-24 animate-pulse rounded-sheet bg-paper-sunken" aria-busy />
        ) : shown.length === 0 ? (
          <EmptyNote title={`Nothing on ${meta.title.toLowerCase()} yet`}>Add the first thing. {partner.display_name} sees it right away.</EmptyNote>
        ) : (
          <ul className="divide-y divide-paper-edge">
            {shown.map((i) => (
              <li key={i.id} className="group flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!i.done_at}
                  aria-label={`${i.text}: ${i.done_at ? meta.doneLabel.toLowerCase() : 'not done'}`}
                  onClick={() => void items.mutate(() => setListItemDone(sb, i.id, i.done_at ? null : me.id)).catch(fail)}
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                    i.done_at ? 'border-sage-500 bg-sage-500 text-white' : 'border-ink/25 hover:border-ink/50',
                  )}
                >
                  {i.done_at ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn('break-words text-body', i.done_at ? 'text-ink-muted line-through' : 'text-ink')}>{i.text}</p>
                  <p className="text-micro text-ink-muted">
                    {i.done_at ? `${meta.doneLabel} by ${nameOf(i.done_by)}` : `Added by ${nameOf(i.added_by)}`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${i.text}`}
                  onClick={() => void items.mutate(() => deleteListItem(sb, i.id)).catch(fail)}
                  className="rounded-full p-1.5 text-ink-muted opacity-60 hover:bg-paper-sunken hover:text-ink hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {doneCount > 0 && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="quiet"
              onClick={() =>
                window.confirm(`Clear ${doneCount} ticked ${doneCount === 1 ? 'item' : 'items'} from ${meta.title}?`) &&
                void items.mutate(() => clearDoneItems(sb, couple.id, list)).catch(fail)
              }
            >
              Clear ticked
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
