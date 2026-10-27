import { useCouple, useDailyDoodle, useFeature } from '@us/shared/react';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Board, type BoardHandle } from '@/components/draw/board';
import { useLocalSession, useSaveDrawing } from '@/components/draw/hooks';
import { Toolbar, useBrush } from '@/components/draw/toolbar';
import { FeatureOff } from '@/components/feature-off';
import { cn } from '@/components/ui/cn';
import { usePalette } from '@/components/ui/palette';
import { Display, Text } from '@/components/ui/text';

/** Today's doodle: draw yours, then see your partner's beside it. */
export default function DailyDoodle() {
  const on = useFeature('draw');
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { width, height: screenH } = useWindowDimensions();
  const { me, partner } = useCouple();
  const daily = useDailyDoodle(on);
  const { session, state } = useLocalSession();
  const save = useSaveDrawing();
  const board = useRef<BoardHandle>(null);
  const { tool, setTool, color, setColor, size, setSize } = useBrush();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = partner.display_name;
  const mine = daily.drawings.find((d) => d.created_by === me.id);
  const theirs = daily.drawings.find((d) => d.created_by !== me.id);
  const boardW = Math.min(width - 32, Math.floor(((screenH - insets.top - 360) * 3) / 4));
  const half = Math.floor((width - 32 - 12) / 2);

  if (!on) return <FeatureOff />;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-2.5 px-4 pb-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-sunken">
          <ChevronLeft size={20} color={c.inkSoft} />
        </Pressable>
        <Text className="flex-1 font-sans-bold text-micro uppercase tracking-[0.5px] text-ink-muted">Today’s doodle</Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 px-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} scrollEnabled={daily.mine}>
        <View className="gap-1">
          <Display className="text-title">{`“${daily.prompt}”`}</Display>
          <Display light italic className="text-lead text-ink-soft">
            {daily.mine ? (daily.partner ? 'Here are both of yours.' : `${name} hasn’t drawn theirs yet. It shows here when they do.`) : `Draw yours. ${name}’s stays hidden until you have.`}
          </Display>
        </View>
        {daily.mine ? (
          <View className="flex-row gap-3">
            {[
              { d: mine, who: 'You' },
              { d: theirs, who: name },
            ].map(({ d, who }) => (
              <View key={who} className="gap-1.5">
                <View className="items-center justify-center overflow-hidden rounded-[18px] border border-paper-edge bg-white" style={{ width: half, height: (half * 4) / 3 }}>
                  {d && daily.urls[d.png_path] ? (
                    <Image source={{ uri: daily.urls[d.png_path] }} style={{ width: half, height: (half * 4) / 3 }} accessibilityLabel={`${who}’s doodle`} />
                  ) : (
                    <Display light italic className="p-4 text-center text-body text-ink-muted">
                      Not drawn yet
                    </Display>
                  )}
                </View>
                <Text className="font-sans-semibold text-body">{who}</Text>
              </View>
            ))}
          </View>
        ) : (
          <>
            <View className="items-center">
              <Board ref={board} session={session} state={state} tool={tool} color={color} size={size} width={boardW} label={`Your doodle of ${daily.prompt}`} />
            </View>
            <Toolbar dense tool={tool} onTool={setTool} color={color} onColor={setColor} size={size} onSize={setSize} onUndo={() => session.undo()} canUndo={session.canUndo} />
            {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy || !state.strokes.length}
              onPress={async () => {
                setBusy(true);
                setError(null);
                try {
                  session.finish();
                  const png = await board.current!.toPng();
                  await save({ kind: 'daily', strokes: session.snapshot.strokes, png, day: daily.day, prompt: daily.prompt, title: daily.prompt });
                  session.reset();
                  daily.reload();
                } catch {
                  setError('That didn’t save. Try again in a moment.');
                } finally {
                  setBusy(false);
                }
              }}
              className={cn('h-14 items-center justify-center rounded-control bg-rose-600', (busy || !state.strokes.length) && 'opacity-50')}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text className="font-sans-semibold text-lead text-white">{daily.partner ? `Save mine and see ${name}’s` : 'Save my doodle'}</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}
