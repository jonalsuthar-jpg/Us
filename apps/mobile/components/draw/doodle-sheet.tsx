import { DRAW_COLORS, notifyPartner, type DrawTool } from '@us/shared';
import { useCouple } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { Eraser, Pen, Send, Undo2, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { Board, type BoardHandle } from './board';
import { useLocalSession, useSaveDrawing } from './hooks';

const COLORS = [0, 1, 2, 5, 7];

interface Props {
  open: boolean;
  onClose: () => void;
  /** 'doodle' leaves it on my partner's Home; 'chat' hands back the picture to send in chat. */
  mode?: 'doodle' | 'chat';
  onChatPicture?: (p: { bytes: Uint8Array; dataUrl: string }) => void;
}

/** "Leave {name} a doodle": a small board, a line to go with it, and send. */
export function DoodleSheet({ open, onClose, mode = 'doodle', onChatPicture }: Props) {
  const { partner, sb } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { session, state } = useLocalSession();
  const save = useSaveDrawing();
  const board = useRef<BoardHandle>(null);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = partner.display_name;

  async function send() {
    session.finish();
    const strokes = session.snapshot.strokes;
    if (!strokes.length) return setError('Draw something first.');
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await board.current!.toDataUrl();
      const bytes = await board.current!.toPng();
      if (mode === 'chat') onChatPicture?.({ bytes, dataUrl });
      else {
        const d = await save({ kind: 'doodle', strokes, forUser: partner.id, note: note.trim() || null, png: bytes });
        void notifyPartner(sb, { category: 'doodle', drawingId: d.id });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      session.reset();
      setNote('');
      onClose();
    } catch {
      setError('That didn’t send. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const iconBtn = (on: boolean) => cn('h-[46px] w-[46px] items-center justify-center rounded-[14px]', on ? 'bg-plum-800' : 'bg-paper-sunken');

  return (
    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-plum-900/45">
          <Pressable accessibilityLabel="Close" className="flex-1" onPress={onClose} />
          <View className="gap-3.5 rounded-t-[26px] bg-paper px-5 pt-2.5" style={{ paddingBottom: insets.bottom + 20 }}>
            <View className="h-[5px] w-10 self-center rounded-full bg-plum-200" />
            <View className="flex-row items-center">
              <Display className="flex-1 text-heading">{mode === 'chat' ? `Doodle for ${name}` : `Leave ${name} a doodle`}</Display>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-sunken">
                <X size={18} color={c.inkSoft} />
              </Pressable>
            </View>
            <Text className="text-small text-ink-soft">
              {mode === 'chat' ? 'It goes in your chat as a picture.' : 'It waits on their Home as a sticky note until they open it.'}
            </Text>
            <View className="flex-row gap-3">
              <Board ref={board} session={session} state={state} tool={tool} color={color} size="m" width={264} raised={false} label="Your doodle" className="rounded-[18px] border border-paper-edge" />
              <View accessibilityRole="toolbar" className="flex-1 items-center gap-2">
                <Pressable accessibilityRole="button" accessibilityLabel="Pen" accessibilityState={{ selected: tool === 'pen' }} onPress={() => setTool('pen')} className={iconBtn(tool === 'pen')}>
                  <Pen size={19} color={tool === 'pen' ? '#FCFAFB' : c.inkSoft} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Eraser" accessibilityState={{ selected: tool === 'eraser' }} onPress={() => setTool('eraser')} className={iconBtn(tool === 'eraser')}>
                  <Eraser size={19} color={tool === 'eraser' ? '#FCFAFB' : c.inkSoft} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Undo" disabled={!session.canUndo} onPress={() => session.undo()} className={cn(iconBtn(false), !session.canUndo && 'opacity-40')}>
                  <Undo2 size={19} color={c.inkSoft} />
                </Pressable>
                {COLORS.map((i, n) => {
                  const on = color === i;
                  return (
                    <Pressable
                      key={i}
                      accessibilityRole="radio"
                      accessibilityLabel={DRAW_COLORS[i]!.name}
                      accessibilityState={{ checked: on }}
                      onPress={() => {
                        setColor(i);
                        setTool('pen');
                      }}
                      className={cn('h-[34px] w-[34px] items-center justify-center rounded-full', n === 0 && 'mt-1.5')}
                      style={on ? { borderWidth: 2, borderColor: DRAW_COLORS[i]!.hex } : null}
                    >
                      <View className="rounded-full" style={{ width: on ? 24 : 28, height: on ? 24 : 28, backgroundColor: DRAW_COLORS[i]!.hex }} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {mode === 'doodle' ? (
              <View className="gap-1.5">
                <Text className="font-sans-semibold text-micro text-ink-soft">A line to go with it (optional)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  maxLength={200}
                  placeholder="chai date tonight?"
                  placeholderTextColor={c.placeholder}
                  accessibilityLabel="A line to go with it"
                  className="h-12 rounded-control border border-paper-edge bg-paper-sunken px-3.5 font-sans text-body text-ink"
                />
              </View>
            ) : null}
            {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void send()}
              className={cn('h-[52px] flex-row items-center justify-center gap-2 rounded-control bg-rose-600 active:bg-rose-700', busy && 'opacity-60')}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Send size={18} color="#fff" />}
              <Text className="font-sans-semibold text-body text-white">{mode === 'chat' ? 'Send in chat' : `Leave it for ${name}`}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
