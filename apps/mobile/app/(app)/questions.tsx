import { dailyState, filterDaily, fromDateKey, type DailyEntry, type DailyFilter } from '@us/shared';
import { useCouple, useFeature } from '@us/shared/react';
import { router } from 'expo-router';
import { CheckCheck, ChevronLeft, ChevronRight, Hourglass, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayLabel, useDaily } from '@/components/connect/daily-question';
import { FeatureOff } from '@/components/feature-off';
import { EmptyNote, ErrorNote } from '@/components/module-screen';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/segmented';
import { cn } from '@/components/ui/cn';
import { FormSheet } from '@/components/ui/form-sheet';
import { usePalette } from '@/components/ui/palette';
import { Display, Text } from '@/components/ui/text';

/** Our answers: every day we've answered, by month, searchable; tap one to read both answers. */
export default function Questions() {
  const on = useFeature('daily_question');
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const daily = useDaily();
  const { me, partner, mySlot, partnerSlot } = useCouple();
  const [filter, setFilter] = useState<DailyFilter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const entries = useMemo(() => {
    const d = daily.data;
    if (!d) return [];
    return dailyState(d.today) === 'ask' ? d.past : [d.today, ...d.past];
  }, [daily.data]);
  const shown = useMemo(() => filterDaily(entries, filter, query), [entries, filter, query]);
  const months = useMemo(() => {
    const out: { key: string; label: string; items: DailyEntry[] }[] = [];
    for (const e of shown) {
      const key = e.for_date.slice(0, 7);
      let g = out.at(-1);
      if (g?.key !== key) {
        g = { key, label: fromDateKey(e.for_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), items: [] };
        out.push(g);
      }
      g.items.push(e);
    }
    return out;
  }, [shown]);
  const index = open ? shown.findIndex((e) => e.question_id === open) : -1;
  const current = index >= 0 ? shown[index]! : null;

  if (!on) return <FeatureOff />;

  const filters: { id: DailyFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'both', label: 'Both answered' },
    { id: 'theirs', label: 'Waiting on me' },
    { id: 'mine', label: `Waiting on ${partner.display_name}` },
  ];

  return (
    <View className="flex-1 bg-paper">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
        contentContainerClassName="gap-5 px-5"
        refreshControl={<RefreshControl refreshing={daily.loading && !!daily.data} onRefresh={() => void daily.reload()} />}
      >
        <View className="flex-row items-center gap-2">
          <IconButton label="Back" size="sm" onPress={() => router.back()}>
            <ChevronLeft size={22} color={c.ink} />
          </IconButton>
          <Text className="text-small text-ink-soft">Connect</Text>
        </View>
        <View>
          <Display className="text-[34px] leading-[38px]">Our answers</Display>
          <Display light italic className="mt-1 text-lead text-ink-soft">
            A little archive of the two of you.
          </Display>
        </View>

        {daily.data ? (
          <View className="flex-row gap-2">
            <Stat label="Streak" value={`${daily.data.streak} ${daily.data.streak === 1 ? 'day' : 'days'}`} wash="bg-gold-50" ink="text-gold-700" />
            <Stat label="Both answered" value={String(daily.data.together)} wash="bg-teal-50" ink="text-teal-700" />
          </View>
        ) : null}

        <View className="h-12 flex-row items-center gap-2.5 rounded-control border border-paper-edge bg-paper-raised px-3.5">
          <Search size={17} color={c.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search questions and answers"
            placeholderTextColor={c.placeholder}
            accessibilityLabel="Search questions and answers"
            returnKeyType="search"
            className="flex-1 font-sans text-body text-ink"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="-mx-5 px-5">
          {filters.map((f) => (
            <Chip key={f.id} selected={filter === f.id} onPress={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </ScrollView>

        {daily.error && !daily.data ? <ErrorNote>{daily.error}</ErrorNote> : null}
        {daily.data && entries.length === 0 ? <EmptyNote title="Just getting started">Answer today’s question and it starts your archive.</EmptyNote> : null}
        {daily.data && entries.length > 0 && shown.length === 0 ? <EmptyNote title="Nothing matches that">Try another word, or show everything.</EmptyNote> : null}

        {months.map((g) => (
          <View key={g.key} className="gap-2.5">
            <Text className="font-sans-semibold text-micro uppercase tracking-[1px] text-ink-muted">{g.label}</Text>
            {g.items.map((e) => (
              <Pressable
                key={e.question_id}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(e.for_date)}. ${e.prompt}`}
                onPress={() => setOpen(e.question_id)}
                className="gap-2.5 rounded-[20px] border border-paper-edge bg-paper-raised p-4 active:bg-paper-sunken"
              >
                <Text className="text-micro text-ink-muted">{dayLabel(e.for_date)}</Text>
                <Display light className="text-lead">
                  {e.prompt}
                </Display>
                <StateBadge entry={e} partnerName={partner.display_name} />
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      <FormSheet open={!!current} onClose={() => setOpen(null)} title={current ? dayLabel(current.for_date, true) : ''}>
        {current ? (
          <>
            <Display light className="text-[26px] leading-[32px]">
              {current.prompt}
            </Display>
            <StateBadge entry={current} partnerName={partner.display_name} />
            <Bubble who="You" name={me.display_name} slot={mySlot} side="left">
              {current.my_answer ?? 'You didn’t answer this one.'}
            </Bubble>
            <Bubble who={partner.display_name} name={partner.display_name} slot={partnerSlot} side="right" muted={current.partner_answer === null}>
              {current.partner_answer ?? (current.partner_answered ? 'Answered. It stays hidden, since you didn’t.' : 'Didn’t answer')}
            </Bubble>
            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: index <= 0 }}
                disabled={index <= 0}
                onPress={() => setOpen(shown[index - 1]!.question_id)}
                className={cn('h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-control bg-paper-sunken', index <= 0 && 'opacity-40')}
              >
                <ChevronLeft size={18} color={c.ink} />
                <Text className="font-sans-medium text-small">Newer</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: index >= shown.length - 1 }}
                disabled={index >= shown.length - 1}
                onPress={() => setOpen(shown[index + 1]!.question_id)}
                className={cn('h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-control bg-paper-sunken', index >= shown.length - 1 && 'opacity-40')}
              >
                <Text className="font-sans-medium text-small">Older</Text>
                <ChevronRight size={18} color={c.ink} />
              </Pressable>
            </View>
          </>
        ) : null}
      </FormSheet>
    </View>
  );
}

function Stat({ label, value, wash, ink }: { label: string; value: string; wash: string; ink: string }) {
  return (
    <View className={cn('rounded-2xl px-4 py-3', wash)}>
      <Text className={cn('text-micro', ink)}>{label}</Text>
      <Display className="text-heading">{value}</Display>
    </View>
  );
}

function StateBadge({ entry, partnerName }: { entry: DailyEntry; partnerName: string }) {
  const c = usePalette();
  const s = dailyState(entry);
  const look =
    s === 'revealed'
      ? { wash: 'bg-teal-50', ink: 'text-teal-700', color: c.onTeal, text: 'Both answered', Icon: CheckCheck }
      : s === 'nudge'
        ? { wash: 'bg-gold-50', ink: 'text-gold-700', color: c.onGold, text: `${partnerName} answered · yours unlocks it`, Icon: Hourglass }
        : { wash: 'bg-plum-50', ink: 'text-plum-600', color: c.onPlum, text: 'Only you answered', Icon: Hourglass };
  return (
    <View className={cn('flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1', look.wash)}>
      <look.Icon size={13} color={look.color} />
      <Text className={cn('font-sans-semibold text-micro', look.ink)}>{look.text}</Text>
    </View>
  );
}

function Bubble({ who, name, slot, side, muted, children }: { who: string; name: string; slot: 'a' | 'b'; side: 'left' | 'right'; muted?: boolean; children: string }) {
  return (
    <View className={cn('gap-2 rounded-[20px] p-4', slot === 'a' ? 'bg-rose-50' : 'bg-teal-50', side === 'left' ? 'rounded-bl-md' : 'rounded-br-md')}>
      <View className="flex-row items-center gap-2">
        <Avatar name={name} slot={slot} size="sm" />
        <Text className={cn('font-sans-semibold text-micro', slot === 'a' ? 'text-rose-700' : 'text-teal-700')}>{who}</Text>
      </View>
      <Text className={cn('text-body', muted && 'italic text-ink-muted')}>{children}</Text>
    </View>
  );
}
