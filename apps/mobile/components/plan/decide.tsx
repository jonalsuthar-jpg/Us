import {
  addDecisionOption,
  decisionCategories,
  listDecisionOptions,
  pickDecision,
  removeDecisionOption,
  updateDecisionOption,
  type DecisionOption,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Dices, Plus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { EmptyNote, ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { Field } from '../ui/field';
import { usePalette } from '../ui/palette';
import { Chip, Segmented } from '../ui/segmented';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

const STARTERS = ['Dinner', 'Film night', 'Weekend'];
const WEIGHTS = [
  { value: '1', label: 'Sure' },
  { value: '2', label: 'Keen' },
  { value: '3', label: 'Really' },
] as const;

export function PlanDecide() {
  const { sb, couple } = useCouple();
  const c = usePalette();
  const options = useCoupleData('plan:decisions', () => listDecisionOptions(sb, couple.id), [sb, couple.id]);
  const all = options.data ?? [];
  const categories = decisionCategories(all);
  const [category, setCategory] = useState<string | null>(null);
  const [newList, setNewList] = useState('');
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState<DecisionOption | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (category === null && categories[0]) setCategory(categories[0]);
  }, [category, categories]);

  const current = category ?? '';
  const inList = all.filter((o) => o.category === current);
  const fail = (e: Error) => setError(e.message);

  async function choose() {
    setError(null);
    setSpinning(true);
    setPicked(null);
    try {
      const [result] = await Promise.all([options.mutate(() => pickDecision(sb, current)), new Promise((r) => setTimeout(r, 650))]);
      setPicked(result);
    } catch (e) {
      fail(e as Error);
    } finally {
      setSpinning(false);
    }
  }

  return (
    <View className="gap-5">
      <View className="flex-row flex-wrap items-center gap-2">
        {categories.map((cat) => (
          <Chip key={cat} selected={cat === current} onPress={() => (setCategory(cat), setPicked(null))}>
            {cat}
          </Chip>
        ))}
        <TextInput
          value={newList}
          onChangeText={setNewList}
          maxLength={60}
          placeholder="New list…"
          placeholderTextColor={c.placeholder}
          accessibilityLabel="New list"
          returnKeyType="done"
          onSubmitEditing={() => {
            const name = newList.trim();
            if (!name) return;
            setCategory(name);
            setNewList('');
            setPicked(null);
          }}
          className="h-9 min-w-[110px] rounded-full border border-dashed border-paper-edge px-3 font-sans text-small text-ink"
        />
      </View>

      {!current ? (
        <View className="gap-3">
          <EmptyNote title="Can’t choose? Let it choose — fairly.">
            Make a list of options. Anything picked recently gets less likely for a couple of weeks.
          </EmptyNote>
          <View className="flex-row flex-wrap justify-center gap-2">
            {STARTERS.map((s) => (
              <Chip key={s} onPress={() => setCategory(s)} icon={<Plus size={14} color={c.inkSoft} />}>
                {s}
              </Chip>
            ))}
          </View>
        </View>
      ) : (
        <>
          <Sheet tone="night" pad="lg" className="min-h-[200px] items-center justify-center">
            {spinning ? (
              <Animated.View key="spin" entering={ZoomIn} exiting={FadeOut}>
                <Dices size={40} color="#E9CD93" />
              </Animated.View>
            ) : picked ? (
              <Animated.View key={picked.id + picked.times_picked} entering={ZoomIn.springify()} className="items-center">
                <Text className="text-small text-paper/70">It’s</Text>
                <Display italic className="mt-1 text-center text-[34px] leading-[40px] text-paper">
                  {picked.label}
                </Display>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn}>
                <Display italic className="text-center text-lead text-paper/80">
                  Can’t decide on {current.toLowerCase()}?
                </Display>
              </Animated.View>
            )}
            <Button variant="night" className="mt-6" disabled={inList.length < 2 || spinning} onPress={choose} icon={<Dices size={16} color="#FAF6F1" />}>
              {picked ? 'Choose again' : 'Choose for us'}
            </Button>
          </Sheet>

          <View className="flex-row items-end gap-2">
            <Field className="flex-1" label={`Add to “${current}”`} value={label} onChangeText={setLabel} maxLength={120} placeholder="Ramen" />
            <Button
              variant="secondary"
              disabled={!label.trim()}
              onPress={() =>
                void options
                  .mutate(() => addDecisionOption(sb, { couple_id: couple.id, category: current, label: label.trim() }))
                  .then(() => setLabel(''))
                  .catch(fail)
              }
            >
              Add
            </Button>
          </View>

          {inList.length === 0 ? (
            <Text className="text-small text-ink-muted">This list is empty. Add at least two options.</Text>
          ) : (
            <Sheet pad="none">
              {inList.map((o, i) => (
                <View key={o.id} className={`gap-2 px-4 py-3 ${i ? 'border-t border-paper-edge' : ''}`}>
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1">
                      <Text>{o.label}</Text>
                      <Text className="text-micro text-ink-muted">{o.times_picked ? `Picked ${o.times_picked}×` : 'Never picked'}</Text>
                    </View>
                    <IconButton label={`Remove ${o.label}`} size="sm" onPress={() => void options.mutate(() => removeDecisionOption(sb, o.id)).catch(fail)}>
                      <X size={16} color={c.inkSoft} />
                    </IconButton>
                  </View>
                  <Segmented
                    size="sm"
                    label={`How much you want ${o.label}`}
                    options={WEIGHTS.map((w) => ({ ...w }))}
                    value={String(Math.min(3, Math.max(1, Math.round(o.weight)))) as '1' | '2' | '3'}
                    onChange={(v) => void options.mutate(() => updateDecisionOption(sb, o.id, { weight: Number(v) })).catch(fail)}
                  />
                </View>
              ))}
            </Sheet>
          )}
        </>
      )}
      {error || options.error ? <ErrorNote>{error ?? options.error}</ErrorNote> : null}
    </View>
  );
}
