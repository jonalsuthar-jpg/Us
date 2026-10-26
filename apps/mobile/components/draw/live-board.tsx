import { LIVE_CANVAS, notifyPartner, type DrawSize, type DrawTool } from '@us/shared';
import { useCouple, useDrawSession } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronLeft, Download, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Alert, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';
import { Board, type BoardHandle } from './board';
import { useBgPhotoUrl, useSaveDrawing } from './hooks';
import { BackgroundSheet, SaveSheet } from './sheets';
import { Toolbar } from './toolbar';

/**
 * Draw together on a phone. As a screen: header, the board, the tools and
 * Clear / Background / Play a game. On a call (`variant="call"`) it's the
 * body of a sheet over the call, with fewer colours and no extras.
 */
export function LiveBoard({ variant = 'screen', onClose }: { variant?: 'screen' | 'call'; onClose?: () => void }) {
  const { partner, partnerSlot, partnerOnline, connection, sb } = useCouple();
  const { session, state, cursor, partnerHere } = useDrawSession(LIVE_CANVAS);
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const board = useRef<BoardHandle>(null);
  const photoUrl = useBgPhotoUrl(state.bg);
  const save = useSaveDrawing();
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState(1);
  const [size, setSize] = useState<DrawSize>('m');
  const [saveOpen, setSaveOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [invited, setInvited] = useState(false);
  const name = partner.display_name;
  const call = variant === 'call';
  // The board fills the width, but leaves room for the tools on short phones.
  const boardW = Math.min(screenW - 32, Math.floor(((screenH - insets.top - (call ? 330 : 360)) * 3) / 4));

  async function doSave(o: { title: string; toMemory: boolean }) {
    session.finish();
    const png = await board.current!.toPng();
    await save({ kind: 'canvas', strokes: session.snapshot.strokes, bg: session.snapshot.bg, png, title: o.title || null, toMemory: o.toMemory });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  const presence = partnerHere ? (
    <View className="flex-row items-center gap-1.5">
      <View className="h-[7px] w-[7px] rounded-full bg-sage-400" />
      <Text className="text-micro text-sage-700">{`${name} is drawing with you`}</Text>
    </View>
  ) : partnerOnline ? (
    <View className="flex-row items-center gap-1.5">
      <View className="h-[7px] w-[7px] rounded-full bg-sage-400" />
      <Text className="text-micro text-ink-soft">{`${name} is in Us`}</Text>
    </View>
  ) : (
    <Pressable
      accessibilityRole="button"
      disabled={invited}
      onPress={() => {
        setInvited(true);
        void notifyPartner(sb, { category: 'draw_invite' });
      }}
    >
      <Text className="text-micro font-sans-semibold text-rose-600">{invited ? `Sent. ${name} will get a notification` : `${name} is away · Invite them`}</Text>
    </Pressable>
  );

  const theBoard = (
    <Board
      ref={board}
      session={session}
      state={state}
      tool={tool}
      color={color}
      size={size}
      cursor={cursor}
      partnerName={name}
      partnerSlot={partnerSlot}
      photoUrl={photoUrl}
      width={boardW}
      label={`Shared drawing with ${name}, ${state.strokes.length} strokes`}
    />
  );

  const sheets = (
    <>
      <SaveSheet open={saveOpen} onClose={() => setSaveOpen(false)} onSave={doSave} />
      <BackgroundSheet open={bgOpen} onClose={() => setBgOpen(false)} current={state.bg} onPick={(bg) => session.setBackground(bg)} />
    </>
  );

  if (call) {
    return (
      <View className="flex-1 gap-3 px-4 pb-5 pt-2.5" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="h-[5px] w-10 self-center rounded-full bg-plum-200" />
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 font-sans-bold text-lead">Drawing on the call</Text>
          <Text className="text-micro text-ink-muted">Audio keeps going</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Save drawing" onPress={() => setSaveOpen(true)} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
            <Download size={18} color={c.inkSoft} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close drawing" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
            <X size={18} color={c.inkSoft} />
          </Pressable>
        </View>
        <View className="items-center">{theBoard}</View>
        <Toolbar layout="compact" tools={['pen', 'eraser']} tool={tool} onTool={setTool} color={color} onColor={setColor} onUndo={() => session.undo()} canUndo={session.canUndo} colors={[1, 0, 5]} />
        {sheets}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-paper-sunken" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-2 px-4 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/connect'))}
          className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised"
        >
          <ChevronLeft size={20} color={c.inkSoft} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-sans-bold text-lead">Draw together</Text>
          {presence}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSaveOpen(true)}
          className="h-11 flex-row items-center gap-1.5 rounded-control bg-rose-600 px-4 active:bg-rose-700"
        >
          <Download size={17} color="#fff" />
          <Text className="font-sans-semibold text-body text-white">Save</Text>
        </Pressable>
      </View>

      <View className="items-center px-4">
        {theBoard}
        <Text className="mt-1.5 self-start pl-1 text-[12px] text-ink-muted">
          {connection === 'live' ? `Synced · ${state.strokes.length} strokes` : 'Offline · drawing here only'}
        </Text>
      </View>

      <View className="flex-1 gap-3.5 px-4 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Toolbar tool={tool} onTool={setTool} color={color} onColor={setColor} size={size} onSize={setSize} onUndo={() => session.undo()} canUndo={session.canUndo} />
        <View className="mt-auto flex-row gap-2">
          <Chunk
            label="Clear…"
            onPress={() =>
              Alert.alert('Clear the canvas?', 'This wipes it for both of you. Save first if you want to keep it.', [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => session.clear() },
              ])
            }
          />
          <Chunk label="Background" onPress={() => setBgOpen(true)} />
          <Chunk label="Play a game" tone="gold" onPress={() => router.push('/draw/guess')} />
        </View>
      </View>
      {sheets}
    </View>
  );
}

function Chunk({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'gold' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className={cn('h-11 flex-1 items-center justify-center rounded-control', tone === 'gold' ? 'bg-gold-50' : 'bg-paper-raised')}>
      <Text className={cn('font-sans-semibold text-body', tone === 'gold' ? 'text-gold-700' : 'text-ink-soft')}>{label}</Text>
    </Pressable>
  );
}
