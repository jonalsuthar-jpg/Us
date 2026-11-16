import {
  addDecisionOption,
  decisionCategories,
  listDecisionOptions,
  pickDecision,
  removeDecisionOption,
  updateDecisionOption,
  wheelSlicePath,
  wheelSpinTarget,
  type DecisionOption,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Heart, Plus, RotateCw, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { EmptyNote, ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { GroupLabel, Pick } from './bits';

const STARTERS = ['Dinner', 'Film night', 'Weekend'];
const FILLS = ['#FF86A3', '#FCC24F', '#50CBB9', '#B39ACC', '#FFB8C9', '#91E3D5', '#FFD98A', '#D4C2E6'];
const SIZE = 280;
const SPIN_MS = 3200;
const WEIGHTS = ['Sure', 'Keen', 'Really keen'];

export function PlanDecide({ initialCategory }: { initialCategory?: string }) {
  const { sb, couple } = useCouple();
  const c = usePalette();
  const options = useCoupleData('plan:decisions', () => listDecisionOptions(sb, couple.id), [sb, couple.id]);
  const all = options.data ?? [];
  const categories = decisionCategories(all);
  const [category, setCategory] = useState<string | null>(initialCategory ?? null);
  const [newList, setNewList] = useState('');
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState<DecisionOption | null>(null);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'reveal' | 'locked'>('idle');
  const [vetoes, setVetoes] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const rot = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wheel = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  useEffect(() => {
    if (category === null && categories[0]) setCategory(categories[0]);
  }, [category, categories]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const current = category ?? '';
  const inList = all.filter((o) => o.category === current);
  const fail = (e: Error) => setError(e.message);

  const switchTo = (cat: string) => {
    clearTimeout(timer.current);
    setCategory(cat);
    setPicked(null);
    setPhase('idle');
    setVetoes(1);
    rot.value = 0;
  };

  async function spin(avoid?: string) {
    setError(null);
    setPhase('spinning');
    try {
      let result = await options.mutate(() => pickDecision(sb, current));
      // A veto shouldn't land on the same thing again; the picker already makes repeats rare.
      for (let i = 0; avoid && result.id === avoid && i < 3; i++) result = await options.mutate(() => pickDecision(sb, current));
      const index = Math.max(0, inList.findIndex((o) => o.id === result.id));
      rot.value = withTiming(wheelSpinTarget(rot.value, index, inList.length), { duration: SPIN_MS, easing: Easing.out(Easing.cubic) });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setPicked(result);
        setPhase('reveal');
      }, SPIN_MS + 100);
    } catch (e) {
      fail(e as Error);
      setPhase('idle');
    }
  }

  return (
    <View className="gap-5">
      <View className="gap-4 rounded-sheet bg-plum-800 p-5">
        <Display light italic className="text-[26px] leading-[32px] text-paper">
          {current ? `Can’t decide on ${current.toLowerCase()}?` : 'Can’t decide?'}
        </Display>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="items-center gap-2 px-5">
          {categories.map((cat) => (
            <Pressable
              key={cat}
              accessibilityRole="button"
              accessibilityState={{ selected: cat === current }}
              onPress={() => switchTo(cat)}
              className={cn('h-10 justify-center rounded-full border px-4', cat === current ? 'border-paper bg-paper' : 'border-white/25')}
            >
              <Text className={cn('font-sans-medium text-small', cat === current ? 'text-plum-800' : 'text-paper/85')}>{cat}</Text>
            </Pressable>
          ))}
          <TextInput
            value={newList}
            onChangeText={setNewList}
            maxLength={60}
            placeholder="+ New list"
            placeholderTextColor="rgba(252,250,251,0.6)"
            accessibilityLabel="New list"
            returnKeyType="done"
            onSubmitEditing={() => {
              const name = newList.trim();
              if (!name) return;
              switchTo(name);
              setNewList('');
            }}
            className="h-10 min-w-[110px] rounded-full border border-dashed border-white/35 px-4 font-sans text-small text-paper"
          />
        </ScrollView>

        {current && inList.length > 1 ? (
          <>
            <View className="items-center">
              <View style={{ width: SIZE, height: SIZE }}>
                <Animated.View style={[{ width: SIZE, height: SIZE }, wheel]}>
                  <Svg width={SIZE} height={SIZE} accessibilityLabel={`Wheel of ${inList.length} options`}>
                    <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 2} fill="#392751" />
                    {inList.map((o, i) => (
                      <G key={o.id}>
                        <Path d={wheelSlicePath(i, inList.length, SIZE / 2 - 6, SIZE / 2)} fill={FILLS[i % FILLS.length]} stroke="#241933" strokeWidth={2} />
                        <SvgText
                          x={SIZE / 2}
                          y={46}
                          fill="#170F21"
                          fontSize={13}
                          fontWeight="600"
                          textAnchor="middle"
                          transform={`rotate(${(360 / inList.length) * (i + 0.5)} ${SIZE / 2} ${SIZE / 2})`}
                        >
                          {o.label.length > 12 ? `${o.label.slice(0, 11)}…` : o.label}
                        </SvgText>
                      </G>
                    ))}
                    <Circle cx={SIZE / 2} cy={SIZE / 2} r={22} fill="#241933" stroke="#FFD98A" strokeWidth={3} />
                  </Svg>
                </Animated.View>
                <Svg width={26} height={30} style={{ position: 'absolute', top: -10, left: SIZE / 2 - 13 }}>
                  <Polygon points="13,30 2,6 13,0 24,6" fill="#FFD98A" stroke="#241933" strokeWidth={2} />
                </Svg>
              </View>
            </View>

            {(phase === 'reveal' || phase === 'locked') && picked ? (
              <Animated.View entering={ZoomIn.springify()} className="items-center rounded-sheet bg-gold-50 p-4">
                <Text className="text-small font-sans-medium text-gold-700">It’s</Text>
                <Display italic className="mt-0.5 text-center text-[32px] leading-[38px]">
                  {picked.label}
                </Display>
                {phase === 'locked' ? (
                  <Text className="mt-3 font-sans-semibold text-sage-700">Locked in. Enjoy!</Text>
                ) : (
                  <>
                    <View className="mt-3.5 w-full flex-row gap-2">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        disabled={!vetoes || inList.length < 3}
                        onPress={() => {
                          setVetoes((v) => v - 1);
                          void spin(picked.id);
                        }}
                      >
                        {vetoes ? 'Veto (1 left)' : 'No vetoes left'}
                      </Button>
                      <Button className="flex-1" onPress={() => setPhase('locked')}>
                        Lock it in
                      </Button>
                    </View>
                    <Text className="mt-2 text-micro text-ink-soft">One veto per spin. Use it wisely.</Text>
                  </>
                )}
              </Animated.View>
            ) : null}
            {phase !== 'reveal' ? (
              <Pressable
                accessibilityRole="button"
                disabled={phase === 'spinning'}
                onPress={() => {
                  setVetoes(1);
                  void spin();
                }}
                className={cn('h-14 flex-row items-center justify-center gap-2 rounded-control bg-gold-200 active:opacity-85', phase === 'spinning' && 'opacity-60')}
              >
                <RotateCw size={20} color="#241933" />
                <Text className="font-sans-bold text-lead text-plum-800">{phase === 'spinning' ? 'Spinning…' : phase === 'idle' ? 'Spin for us' : 'Spin again'}</Text>
              </Pressable>
            ) : null}
          </>
        ) : current ? (
          <Text className="text-small text-paper/75">Add at least two options below to spin.</Text>
        ) : null}
      </View>

      {!current ? (
        <View className="gap-3">
          <EmptyNote title="Can’t choose? Let it choose, fairly.">Make a list of options. Anything picked recently gets less likely for a couple of weeks.</EmptyNote>
          <View className="flex-row flex-wrap justify-center gap-2">
            {STARTERS.map((s) => (
              <Pick key={s} selected={false} onPress={() => switchTo(s)} icon={<Plus size={14} color={c.inkSoft} />}>
                {s}
              </Pick>
            ))}
          </View>
        </View>
      ) : (
        <View className="gap-2.5">
          <GroupLabel right={<Text className="text-micro text-ink-muted">More hearts = more likely</Text>}>On the wheel</GroupLabel>
          <View className="rounded-sheet border border-paper-edge bg-paper-raised px-3.5">
            {inList.map((o, i) => (
              <View key={o.id} className="flex-row items-center gap-2 border-b border-paper-sunken py-1.5">
                <View className="h-3 w-3 rounded" style={{ backgroundColor: FILLS[i % FILLS.length] }} />
                <View className="flex-1">
                  <Text numberOfLines={1}>{o.label}</Text>
                  <Text className="text-micro text-ink-muted">{o.times_picked ? `Picked ${o.times_picked}×` : 'Never picked'}</Text>
                </View>
                <View accessibilityRole="radiogroup" accessibilityLabel={`How much you want ${o.label}`} className="flex-row">
                  {[1, 2, 3].map((h) => {
                    const lit = h <= Math.round(o.weight);
                    return (
                      <Pressable
                        key={h}
                        accessibilityRole="radio"
                        accessibilityLabel={WEIGHTS[h - 1]}
                        accessibilityState={{ checked: Math.round(o.weight) === h }}
                        hitSlop={4}
                        onPress={() => void options.mutate(() => updateDecisionOption(sb, o.id, { weight: h })).catch(fail)}
                        className="h-10 w-8 items-center justify-center"
                      >
                        <Heart size={18} color={lit ? '#E2336A' : c.faint} fill={lit ? '#F5547C' : 'transparent'} />
                      </Pressable>
                    );
                  })}
                </View>
                <IconButton label={`Remove ${o.label}`} size="sm" onPress={() => void options.mutate(() => removeDecisionOption(sb, o.id)).catch(fail)}>
                  <X size={16} color={c.inkMuted} />
                </IconButton>
              </View>
            ))}
            <View className="flex-row items-center gap-2 py-1.5">
              <TextInput
                value={label}
                onChangeText={setLabel}
                maxLength={120}
                placeholder={`Add to “${current}”…`}
                placeholderTextColor={c.placeholder}
                accessibilityLabel={`Add to ${current}`}
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => addOption()}
                className="h-11 flex-1 font-sans text-body text-ink"
              />
              <Button variant="quiet" size="sm" disabled={!label.trim()} onPress={addOption}>
                Add
              </Button>
            </View>
          </View>
          <Display light italic className="text-center text-small text-ink-soft">
            Anything picked lately sits back for a couple of weeks. Fair to both of you.
          </Display>
        </View>
      )}
      {error || options.error ? <ErrorNote>{error ?? options.error}</ErrorNote> : null}
    </View>
  );

  function addOption() {
    if (!label.trim()) return;
    void options
      .mutate(() => addDecisionOption(sb, { couple_id: couple.id, category: current, label: label.trim() }))
      .then(() => setLabel(''))
      .catch(fail);
  }
}
