import {
  saveSticker,
  STICKER_SIZE,
  STICKER_TEXT_STYLES,
  stickerTextBox,
  STICKERS_TOPIC,
  strokeWidth,
  uuid,
  type Sticker,
  type StickerText,
  type StickerTextStyle,
  type Stroke,
} from '@us/shared';
import { useCouple } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Pencil, Type, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Switch, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, G, Image as SvgImage, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import { canCutout, cutout } from '@/modules/us-cutout';
import { useLocalSession } from '../draw/hooks';
import { InkLayers, InkPath } from '../draw/svg-ink';
import { Toolbar, useBrush } from '../draw/toolbar';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';

/** Sticker space: ink and text are laid out on a 3000 × 3000 square. */
const B = 3000;
const OUTLINE = 14;
const SIZES = [
  { id: 's', v: 0.09 },
  { id: 'm', v: 0.13 },
  { id: 'l', v: 0.18 },
];

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A sticker's text, drawn the way both apps draw it. */
export function StickerTextSvg({ t }: { t: StickerText }) {
  const st = STICKER_TEXT_STYLES.find((s) => s.id === t.style) ?? STICKER_TEXT_STYLES[0];
  const fs = t.size * B;
  const box = stickerTextBox(t);
  const cx = t.x * B;
  const cy = t.y * B;
  const baseline = cy + fs * 0.36;
  return (
    <G>
      {st.bg ? <Rect x={cx - (box.w * B) / 2} y={cy - (box.h * B) / 2} width={box.w * B} height={box.h * B} rx={(box.h * B) / 2.4} fill={st.bg} /> : null}
      {st.stroke ? (
        <SvgText x={cx} y={baseline} fontSize={fs} fontFamily="Inter_700Bold" textAnchor="middle" fill={st.stroke} stroke={st.stroke} strokeWidth={fs * 0.24} strokeLinejoin="round">
          {t.text}
        </SvgText>
      ) : null}
      <SvgText x={cx} y={baseline} fontSize={fs} fontFamily="Inter_700Bold" textAnchor="middle" fill={st.fill}>
        {t.text}
      </SvgText>
    </G>
  );
}

/** The grey-and-white squares that say "this part is see-through". */
function Checker({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Defs>
        <Pattern id="checker" width={24} height={24} patternUnits="userSpaceOnUse">
          <Rect width={24} height={24} fill="#FFFFFF" />
          <Rect width={12} height={12} fill="#EDE8EC" />
          <Rect x={12} y={12} width={12} height={12} fill="#EDE8EC" />
        </Pattern>
      </Defs>
      <Rect width={size} height={size} fill="url(#checker)" />
    </Svg>
  );
}

/** A text on the sticker that can be dragged (and tapped to edit) in text mode. */
function TextHandle({ t, size, onMove, onEdit }: { t: StickerText; size: number; onMove: (x: number, y: number) => void; onEdit: () => void }) {
  const start = useRef({ x: t.x, y: t.y });
  const box = stickerTextBox(t);
  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Pan()
          .runOnJS(true)
          .onBegin(() => {
            start.current = { x: t.x, y: t.y };
          })
          .onUpdate((e) =>
            onMove(Math.max(0.05, Math.min(0.95, start.current.x + e.translationX / size)), Math.max(0.05, Math.min(0.95, start.current.y + e.translationY / size))),
          ),
        Gesture.Tap().runOnJS(true).onEnd(onEdit),
      ),
    [t.x, t.y, size, onMove, onEdit],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Text: ${t.text}. Drag to move, tap to edit`}
        className="absolute rounded-xl border-2 border-dashed border-rose-400"
        style={{ left: (t.x - box.w / 2) * size, top: (t.y - box.h / 2) * size, width: box.w * size, height: box.h * size }}
      />
    </GestureDetector>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** A sticker was saved; `send` when "Save & send" was tapped. */
  onSaved: (s: Sticker, send: boolean) => void;
}

/**
 * Make a sticker from a photo: the subject is lifted out (with a white
 * outline), then add text and draw on it. Saved as a 512 × 512 transparent
 * PNG in Ours.
 */
export function StickerMaker({ open, onClose, onSaved }: Props) {
  const { sb, couple, me, channel } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { session, state } = useLocalSession();
  const brush = useBrush({ color: 0, size: 70 });
  const svg = useRef<Svg>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cuts, setCuts] = useState<{ outline?: string | null; plain?: string | null }>({});
  const [useCut, setUseCut] = useState(true);
  const [outline, setOutline] = useState(true);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<'draw' | 'text'>('text');
  const [texts, setTexts] = useState<StickerText[]>([]);
  const [editing, setEditing] = useState<StickerText | null>(null);
  const [saving, setSaving] = useState<null | 'save' | 'send'>(null);
  const size = Math.floor(Math.min(width - 32, height - insets.top - insets.bottom - 330));

  // The cut-out for the current outline choice, made once and kept.
  const cutKey = outline ? 'outline' : 'plain';
  const cutUri = cuts[cutKey];
  const base = useCut && cutUri ? { uri: cutUri, cut: true } : photo ? { uri: photo, cut: false } : null;

  function reset() {
    setPhoto(null);
    setCuts({});
    setTexts([]);
    setEditing(null);
    setNote(null);
    setUseCut(true);
    setOutline(true);
    setMode('text');
    session.reset();
  }

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) {
      if (!photo) onClose();
      return;
    }
    setPhoto(asset.uri);
    setCuts({});
    setUseCut(true);
  }

  // Open: pick a photo straight away.
  useEffect(() => {
    if (open && !photo) void pick();
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cut the subject out (once per outline choice).
  useEffect(() => {
    if (!photo || !useCut || cutKey in cuts) return;
    if (!canCutout) {
      setUseCut(false);
      setNote('This app version can’t cut out yet, so it’s the whole photo for now. The cut-out comes with the next app build.');
      return;
    }
    let live = true;
    setWorking(true);
    setNote(null);
    void cutout(photo, { outline: outline ? OUTLINE : 0, size: STICKER_SIZE })
      .then((res) => {
        if (!live) return;
        setCuts((prev) => ({ ...prev, [cutKey]: res?.uri ?? null }));
        if (!res) {
          setUseCut(false);
          setNote('Couldn’t find a person or thing to lift out, so it’s the whole photo.');
        }
      })
      .catch(() => {
        if (!live) return;
        setCuts((prev) => ({ ...prev, [cutKey]: null }));
        setUseCut(false);
        setNote('The cut-out didn’t work on this photo, so it’s the whole photo.');
      })
      .finally(() => live && setWorking(false));
    return () => {
      live = false;
    };
  }, [photo, useCut, cutKey, cuts, outline]);

  const draw = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .runOnJS(true)
        .enabled(mode === 'draw' && !!base)
        .onBegin((e) => session.begin((e.x / size) * B, (e.y / size) * B, brush.tool, brush.color, strokeWidth(brush.tool, brush.size)))
        .onUpdate((e) => session.move((e.x / size) * B, (e.y / size) * B))
        .onFinalize(() => session.finish()),
    [mode, base, size, session, brush.tool, brush.color, brush.size],
  );

  const finishedKey = state.strokes.filter((s) => !s.live).map((s) => `${s.id}:${s.p.length}`).join('|');
  const finished = useMemo<Stroke[]>(() => state.strokes.filter((s) => !s.live), [finishedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = state.strokes.filter((s) => s.live);

  async function save(send: boolean) {
    const node = svg.current as unknown as { toDataURL?: (cb: (b64: string) => void, o?: { width: number; height: number }) => void } | null;
    if (!node?.toDataURL || !base) return;
    setSaving(send ? 'send' : 'save');
    try {
      session.finish();
      const b64 = await new Promise<string>((resolve) => node.toDataURL!((d) => resolve(d), { width: STICKER_SIZE, height: STICKER_SIZE }));
      const sticker = await saveSticker(sb, { coupleId: couple.id, me: me.id, png: base64ToBytes(b64) });
      channel.sendChanged(STICKERS_TOPIC);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved(sticker, send);
      onClose();
    } catch {
      setNote('That didn’t save. Check your connection and try again.');
    } finally {
      setSaving(null);
    }
  }

  const tab = (on: boolean) => cn('h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl', on ? 'bg-plum-800' : 'bg-paper-raised');

  return (
    <Modal visible={open} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-paper-sunken" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
          <View className="flex-row items-center gap-2 px-4 pb-3">
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
              <X size={18} color={c.inkSoft} />
            </Pressable>
            <Display className="flex-1 text-heading">New sticker</Display>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose another photo" onPress={() => void pick()} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
              <ImagePlus size={18} color={c.inkSoft} />
            </Pressable>
          </View>

          <View className="items-center">
            <View className="overflow-hidden rounded-[20px]" style={{ width: size, height: size }}>
              <Checker size={size} />
              <GestureDetector gesture={draw}>
                <View collapsable={false} style={{ width: size, height: size }}>
                  <Svg ref={svg} width={size} height={size} viewBox={`0 0 ${B} ${B}`}>
                    {base ? <SvgImage href={{ uri: base.uri }} x={0} y={0} width={B} height={B} preserveAspectRatio={base.cut ? 'xMidYMid meet' : 'xMidYMid slice'} /> : null}
                    <InkLayers strokes={finished} id="sticker" />
                    {live.map((s) => (
                      <InkPath key={s.id} s={s} />
                    ))}
                    {texts.map((t) => (
                      <StickerTextSvg key={t.id} t={t} />
                    ))}
                  </Svg>
                </View>
              </GestureDetector>
              {mode === 'text'
                ? texts.map((t) => (
                    <TextHandle
                      key={t.id}
                      t={t}
                      size={size}
                      onMove={(x, y) => setTexts((all) => all.map((o) => (o.id === t.id ? { ...o, x, y } : o)))}
                      onEdit={() => setEditing(t)}
                    />
                  ))
                : null}
              {working || !base ? (
                <View className="absolute inset-0 items-center justify-center gap-2 bg-white/70">
                  <ActivityIndicator color={c.rose} />
                  <Text className="text-small text-ink-soft">{photo ? 'Lifting it out…' : 'Pick a photo'}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View className="flex-1 gap-2.5 px-4 pt-3">
            {note ? <Text className="text-small text-ink-soft">{note}</Text> : null}
            {canCutout && photo ? (
              <View className="flex-row items-center gap-3">
                <View className="flex-1 flex-row rounded-xl bg-paper-raised p-1">
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: useCut }} onPress={() => setUseCut(true)} className={cn('h-9 flex-1 items-center justify-center rounded-lg', useCut && 'bg-plum-800')}>
                    <Text className={cn('font-sans-semibold text-small', useCut ? 'text-paper' : 'text-ink-soft')}>Cut-out</Text>
                  </Pressable>
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: !useCut }} onPress={() => setUseCut(false)} className={cn('h-9 flex-1 items-center justify-center rounded-lg', !useCut && 'bg-plum-800')}>
                    <Text className={cn('font-sans-semibold text-small', !useCut ? 'text-paper' : 'text-ink-soft')}>Whole photo</Text>
                  </Pressable>
                </View>
                {useCut ? (
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-small text-ink-soft">Outline</Text>
                    <Switch value={outline} onValueChange={setOutline} trackColor={{ true: c.rose }} accessibilityLabel="White outline" />
                  </View>
                ) : null}
              </View>
            ) : null}

            <View className="flex-row gap-2">
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'text' }} onPress={() => setMode('text')} className={tab(mode === 'text')}>
                <Type size={17} color={mode === 'text' ? '#FCFAFB' : c.inkSoft} />
                <Text className={cn('font-sans-semibold text-small', mode === 'text' ? 'text-paper' : 'text-ink-soft')}>Text</Text>
              </Pressable>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'draw' }} onPress={() => setMode('draw')} className={tab(mode === 'draw')}>
                <Pencil size={17} color={mode === 'draw' ? '#FCFAFB' : c.inkSoft} />
                <Text className={cn('font-sans-semibold text-small', mode === 'draw' ? 'text-paper' : 'text-ink-soft')}>Draw</Text>
              </Pressable>
            </View>

            {mode === 'draw' ? (
              <Toolbar
                dense
                tools={['pen', 'pencil', 'marker', 'calligraphy', 'eraser']}
                tool={brush.tool}
                onTool={brush.setTool}
                color={brush.color}
                onColor={brush.setColor}
                onUndo={() => session.undo()}
                canUndo={session.canUndo}
              />
            ) : (
              <View className="gap-2">
                <Pressable
                  accessibilityRole="button"
                  disabled={!base}
                  onPress={() => setEditing({ id: uuid(), text: '', style: 'outline', x: 0.5, y: texts.length ? 0.2 : 0.82, size: 0.13 })}
                  className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-paper-raised"
                >
                  <Type size={17} color={c.ink} />
                  <Text className="font-sans-semibold text-body">Add text</Text>
                </Pressable>
                {texts.length ? <Text className="text-center text-micro text-ink-muted">Drag text to move it, tap it to change it.</Text> : null}
              </View>
            )}

            <View className="mt-auto flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={!base || working || !!saving}
                onPress={() => void save(false)}
                className={cn('h-12 flex-1 items-center justify-center rounded-control border border-plum-200', (!base || working) && 'opacity-50')}
              >
                {saving === 'save' ? <ActivityIndicator color={c.rose} /> : <Text className="font-sans-semibold text-body">Save</Text>}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!base || working || !!saving}
                onPress={() => void save(true)}
                className={cn('h-12 flex-[1.4] items-center justify-center rounded-control bg-rose-600 active:bg-rose-700', (!base || working) && 'opacity-50')}
              >
                {saving === 'send' ? <ActivityIndicator color="#fff" /> : <Text className="font-sans-semibold text-body text-white">Save & send</Text>}
              </Pressable>
            </View>
          </View>
        </View>

        <TextSheet
          value={editing}
          onClose={() => setEditing(null)}
          onDone={(t) => {
            setEditing(null);
            setTexts((all) => (t.text.trim() ? (all.some((o) => o.id === t.id) ? all.map((o) => (o.id === t.id ? t : o)) : [...all, t]) : all.filter((o) => o.id !== t.id)));
          }}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Type the text and pick its look and size. */
function TextSheet({ value, onClose, onDone }: { value: StickerText | null; onClose: () => void; onDone: (t: StickerText) => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<StickerText | null>(value);
  useEffect(() => setDraft(value), [value]);
  if (!draft) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-plum-900/50">
        <Pressable accessibilityLabel="Close" className="flex-1" onPress={onClose} />
        <View className="gap-3 rounded-t-[26px] bg-paper px-5 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <TextInput
            autoFocus
            value={draft.text}
            onChangeText={(text) => setDraft({ ...draft, text: text.slice(0, 40) })}
            placeholder="Say something"
            placeholderTextColor={c.placeholder}
            accessibilityLabel="Sticker text"
            className="h-12 rounded-control border border-paper-edge bg-paper-sunken px-3.5 font-sans text-lead text-ink"
          />
          <View accessibilityRole="radiogroup" accessibilityLabel="Look" className="flex-row gap-2">
            {STICKER_TEXT_STYLES.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityLabel={s.name}
                accessibilityState={{ checked: draft.style === s.id }}
                onPress={() => setDraft({ ...draft, style: s.id as StickerTextStyle })}
                className={cn('h-11 flex-1 items-center justify-center rounded-xl border-2', draft.style === s.id ? 'border-plum-800' : 'border-transparent')}
                style={{ backgroundColor: s.bg ?? '#9A93A3' }}
              >
                <Text className="font-sans-bold text-body" style={{ color: s.fill }}>
                  Aa
                </Text>
              </Pressable>
            ))}
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel="Size" className="flex-row gap-2">
            {SIZES.map((sz, i) => (
              <Pressable
                key={sz.id}
                accessibilityRole="radio"
                accessibilityLabel={['Small', 'Medium', 'Large'][i]}
                accessibilityState={{ checked: draft.size === sz.v }}
                onPress={() => setDraft({ ...draft, size: sz.v })}
                className={cn('h-10 flex-1 items-center justify-center rounded-xl', draft.size === sz.v ? 'bg-plum-800' : 'bg-paper-sunken')}
              >
                <Text className={cn('font-sans-bold', draft.size === sz.v ? 'text-paper' : 'text-ink-soft')} style={{ fontSize: 13 + i * 4 }}>
                  A
                </Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-2">
            <Pressable accessibilityRole="button" onPress={() => onDone({ ...draft, text: '' })} className="h-12 flex-1 items-center justify-center rounded-control bg-paper-sunken">
              <Text className="font-sans-semibold text-body text-ink-soft">Remove</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onDone(draft)} className="h-12 flex-[2] items-center justify-center rounded-control bg-rose-600">
              <Text className="font-sans-semibold text-body text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
