import {
  addDecisionOption,
  addListItem,
  clearDoneItems,
  deleteListItem,
  LIST_NAMES,
  LISTS,
  listDecisionOptions,
  listItems,
  setListItemDone,
  sortListItems,
  type ListName,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { BookOpen, Check, ChevronDown, ChevronRight, ChevronUp, Clapperboard, Dices, Globe, Plus, ShoppingBag, X, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { GradientView } from './art';
import { SLOT_BG, TONE, toneIcon, type Tone } from './tones';

/** Each list's colour: a gradient for its tile when it's open, the deep stop for its ticks and add button. */
const STYLE: Record<ListName, { tone: Tone; Icon: LucideIcon; ring: string; from: string; decide?: string }> = {
  groceries: { tone: 'teal', Icon: ShoppingBag, ring: '#0A776D', from: '#22B8A6' },
  bucket: { tone: 'gold', Icon: Globe, ring: '#E0950F', from: '#FCCB5A' },
  watch: { tone: 'rose', Icon: Clapperboard, ring: '#E2336A', from: '#F7709A', decide: 'Film night' },
  read: { tone: 'plum', Icon: BookOpen, ring: '#4B3468', from: '#8A6BB8', decide: 'Next book' },
};

const CARD = { shadowColor: '#3F2C66', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 };

/** Shared lists: groceries, a bucket list, things to watch and read. */
export function PlanLists({ onPick }: { onPick?: (category: string) => void }) {
  const { sb, couple, me, partner, mySlot, partnerSlot } = useCouple();
  const c = usePalette();
  const items = useCoupleData('plan:lists', () => listItems(sb, couple.id), [sb, couple.id, true]);
  const options = useCoupleData('plan:decisions', () => (onPick ? listDecisionOptions(sb, couple.id) : Promise.resolve([])), [sb, couple.id, !!onPick]);
  const [list, setList] = useState<ListName>('groceries');
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);

  const all = items.data ?? [];
  const shown = sortListItems(all.filter((i) => i.list === list));
  const open = shown.filter((i) => !i.done_at);
  const done = shown.filter((i) => i.done_at);
  const meta = LISTS[list];
  const style = STYLE[list];
  const nameOf = (id: string | null) => (id === me.id ? 'you' : id === partner.id ? partner.display_name : 'someone');
  const again = list === 'groceries' ? [...new Map(done.map((i) => [i.text.toLowerCase(), i])).values()].filter((i) => !open.some((o) => o.text.toLowerCase() === i.text.toLowerCase())).slice(0, 4) : [];

  const add = () => {
    if (!text.trim()) return;
    setError(null);
    void items
      .mutate(() => addListItem(sb, { couple_id: couple.id, list, text, added_by: me.id }))
      .then(() => setText(''))
      .catch(fail);
  };

  // Puts this list's open items on a Decide wheel (adding any that aren't there yet), then opens it.
  async function pickOne() {
    const category = style.decide!;
    setBusy(true);
    setError(null);
    try {
      const have = new Set((options.data ?? []).filter((o) => o.category === category).map((o) => o.label.toLowerCase()));
      const missing = open.map((i) => i.text.trim().slice(0, 120)).filter((t) => t && !have.has(t.toLowerCase()));
      if (missing.length) await options.mutate(() => Promise.all(missing.map((label) => addDecisionOption(sb, { couple_id: couple.id, category, label }))));
      onPick!(category);
    } catch (e) {
      fail(e as Error);
      setBusy(false);
    }
  }

  return (
    <View className="gap-4">
      {/* All four lists at once, two by two. */}
      <View className="flex-row flex-wrap justify-between gap-y-2.5">
        {LIST_NAMES.map((n) => {
          const st = STYLE[n];
          const of = all.filter((i) => i.list === n);
          const left = of.filter((i) => !i.done_at).length;
          const on = n === list;
          const pct = of.length ? (of.length - left) / of.length : 0;
          const body = (
            <>
              <View className={cn('h-10 w-10 items-center justify-center rounded-[13px]', on ? 'bg-white' : TONE[st.tone].wash)}>
                <st.Icon size={20} color={on ? st.ring : toneIcon(c, st.tone)} />
              </View>
              <View className="flex-1 gap-1">
                <Text className={cn('font-sans-bold text-small', on ? 'text-white' : 'text-ink')} numberOfLines={1}>
                  {LISTS[n].title}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <View className={cn('h-[5px] flex-1 overflow-hidden rounded-full', on ? 'bg-white/30' : TONE[st.tone].wash)}>
                    <View className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, backgroundColor: on ? '#fff' : st.ring }} />
                  </View>
                  <Text className={cn('font-sans-bold text-[11px]', on ? 'text-white' : TONE[st.tone].ink)}>{left ? `${left} left` : of.length ? 'Done' : 'Empty'}</Text>
                </View>
              </View>
            </>
          );
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${LISTS[n].title}, ${left} left`}
              onPress={() => (setList(n), setShowDone(false))}
              className="w-[48.5%]"
              style={[{ borderRadius: 20, backgroundColor: on ? st.ring : c.paperRaised }, CARD]}
            >
              {on ? (
                <GradientView from={st.from} to={st.ring} radius={20} className="flex-row items-center gap-2.5 p-2.5">
                  {body}
                </GradientView>
              ) : (
                <View className="flex-row items-center gap-2.5 rounded-[20px] bg-paper-raised p-2.5">{body}</View>
              )}
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row items-center gap-2 rounded-[20px] bg-paper-raised py-1.5 pl-1.5 pr-1.5" style={CARD}>
        <TextInput
          accessibilityLabel={`Add to ${meta.title}`}
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          returnKeyType="done"
          blurOnSubmit={false}
          maxLength={200}
          placeholder={meta.placeholder}
          placeholderTextColor={c.placeholder}
          className="h-12 flex-1 px-3 font-sans text-body text-ink"
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={add} className="h-12 w-12 items-center justify-center rounded-[15px] active:opacity-80" style={{ backgroundColor: style.ring }}>
          <Plus size={22} color="#fff" strokeWidth={2.4} />
        </Pressable>
      </View>

      {again.length ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-micro text-ink-muted">Buy again</Text>
          {again.map((i) => (
            <Pressable
              key={i.id}
              accessibilityRole="button"
              onPress={() => void items.mutate(() => setListItemDone(sb, i.id, null)).catch(fail)}
              className="h-9 justify-center rounded-full border border-dashed border-plum-300 px-3 active:bg-paper-sunken"
            >
              <Text className="text-small text-plum-600">+ {i.text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {style.decide && onPick && open.length > 1 ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void pickOne()} className={cn('flex-row items-center gap-3 rounded-sheet bg-plum-800 px-4 py-3.5', busy && 'opacity-60')}>
          <Dices size={22} color="#FFD98A" />
          <View className="flex-1">
            <Text className="font-sans-semibold text-paper">Pick one for tonight</Text>
            <Text className="text-micro text-paper/70">Spin the wheel with these {open.length}</Text>
          </View>
          <ChevronRight size={18} color="#FFD98A" />
        </Pressable>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <View className="rounded-[24px] bg-paper-raised px-3.5 pt-2" style={CARD}>
        {open.length ? <Text className="px-1 pb-1 pt-1.5 font-sans-bold text-[12px] uppercase tracking-[1px] text-plum-600">{`To ${list === 'groceries' ? 'get' : 'do'} · ${open.length}`}</Text> : null}
        {open.length === 0 && !items.loading ? (
          <View className="items-center py-6">
            <Display italic className="text-lead">
              {done.length ? 'All done.' : `Nothing on ${meta.title.toLowerCase()} yet`}
            </Display>
            <Text className="mt-1 text-center text-small text-ink-soft">{`Add the next thing above. ${partner.display_name} sees it right away.`}</Text>
          </View>
        ) : (
          open.map((i) => (
            <Animated.View key={i.id} entering={FadeIn} layout={LinearTransition} className="flex-row items-center gap-2 border-b border-paper-sunken py-1">
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: false }}
                accessibilityLabel={i.text}
                onPress={() => void items.mutate(() => setListItemDone(sb, i.id, me.id)).catch(fail)}
                className="h-11 w-11 items-center justify-center"
              >
                <View className="h-[26px] w-[26px] rounded-full border-[2.5px]" style={{ borderColor: style.ring }} />
              </Pressable>
              <View className="flex-1">
                <Text>{i.text}</Text>
                <Text className="text-micro text-ink-muted">Added by {nameOf(i.added_by)}</Text>
              </View>
              <View className={cn('h-2 w-2 rounded-full', SLOT_BG[i.added_by === me.id ? mySlot : partnerSlot])} />
              <IconButton label={`Remove ${i.text}`} size="sm" onPress={() => void items.mutate(() => deleteListItem(sb, i.id)).catch(fail)}>
                <X size={16} color={c.inkMuted} />
              </IconButton>
            </Animated.View>
          ))
        )}

        {done.length ? (
          <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDone }} onPress={() => setShowDone((x) => !x)} className="h-12 flex-row items-center justify-between">
              <Text className="font-sans-medium text-small text-ink-soft">Done ({done.length})</Text>
              {showDone ? <ChevronUp size={18} color={c.inkSoft} /> : <ChevronDown size={18} color={c.inkSoft} />}
            </Pressable>
            {showDone ? (
              <>
                {done.map((i) => (
                  <View key={i.id} className="flex-row items-center gap-2 border-t border-paper-sunken py-1">
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: true }}
                      accessibilityLabel={i.text}
                      onPress={() => void items.mutate(() => setListItemDone(sb, i.id, null)).catch(fail)}
                      className="h-11 w-11 items-center justify-center"
                    >
                      <View className="h-[26px] w-[26px] items-center justify-center rounded-full" style={{ backgroundColor: style.ring }}>
                        <Check size={14} color="#fff" strokeWidth={3} />
                      </View>
                    </Pressable>
                    <View className="flex-1">
                      <Text className="text-ink-muted line-through">{i.text}</Text>
                      <Text className="text-micro text-ink-muted">{`${meta.doneLabel} · ${nameOf(i.done_by)}`}</Text>
                    </View>
                  </View>
                ))}
                <Button
                  variant="quiet"
                  size="sm"
                  className="self-end"
                  onPress={() =>
                    Alert.alert(`Clear ${done.length} ticked ${done.length === 1 ? 'item' : 'items'}?`, undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', onPress: () => void items.mutate(() => clearDoneItems(sb, couple.id, list)).catch(fail) },
                    ])
                  }
                >
                  Clear ticked
                </Button>
              </>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}
