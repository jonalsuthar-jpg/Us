import { clusters, groupByDay, type Message } from '@us/shared';
import { useCallManager, useCouple, useMessages, useTyping } from '@us/shared/react';
import { router, useFocusEffect } from 'expo-router';
import { Phone, Settings, Video } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bubble, CallEntry } from '@/components/chat/bubble';
import { Composer } from '@/components/chat/composer';
import { TypingBubble } from '@/components/chat/typing-bubble';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { Display, Text } from '@/components/ui/text';
import { usePalette } from '@/components/ui/palette';

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; message: Message; first: boolean; last: boolean };

/** True while this screen is focused and the app is in the foreground. */
function useViewing() {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return focused && active;
}

export default function Talk() {
  const insets = useSafeAreaInsets();
  const { me, partner, mySlot, partnerSlot, partnerOnline } = useCouple();
  const viewing = useViewing();
  const { messages, loading, hasOlder, loadOlder, send, retry } = useMessages({ viewing });
  const { partnerTyping, onComposerChange, onComposerSent } = useTyping();
  const calls = useCallManager();
  const c = usePalette();

  // Inverted list → newest first.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of groupByDay(messages)) {
      out.push({ kind: 'day', key: `day-${g.key}`, label: g.day });
      g.items.forEach((m, i) =>
        out.push({ kind: 'msg', key: m.id, message: m, first: !clusters(g.items[i - 1], m), last: !clusters(m, g.items[i + 1]) }),
      );
    }
    return out.reverse();
  }, [messages]);

  return (
    <KeyboardAvoidingView className="flex-1 bg-paper" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center gap-3 border-b border-paper-edge px-4 pb-3">
        <Avatar name={partner.display_name} slot={partnerSlot} online={partnerOnline} />
        <View className="flex-1">
          <Display className="text-heading" numberOfLines={1}>
            {partner.display_name}
          </Display>
          <Text className={partnerTyping ? 'font-display-italic text-small text-rose-700' : 'text-small text-ink-muted'}>
            {partnerTyping ? 'typing…' : partnerOnline ? 'here now' : 'away'}
          </Text>
        </View>
        <IconButton label={`Voice call ${partner.display_name}`} tone="rose" size="sm" onPress={() => void calls.startCall('audio')}>
          <Phone size={19} color={c.onRose} />
        </IconButton>
        <IconButton label={`Video call ${partner.display_name}`} tone="rose" size="sm" onPress={() => void calls.startCall('video')}>
          <Video size={19} color={c.onRose} />
        </IconButton>
        <IconButton label="Settings" size="sm" onPress={() => router.push('/settings')}>
          <Settings size={19} color={c.inkSoft} />
        </IconButton>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={c.rose} />
        </View>
      ) : (
        <FlatList
          inverted
          className="flex-1 px-4"
          data={rows}
          keyExtractor={(r) => r.key}
          keyboardDismissMode="interactive"
          onEndReached={() => hasOlder && void loadOlder()}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={<TypingBubble visible={partnerTyping} name={partner.display_name} slot={partnerSlot} />}
          ListEmptyComponent={
            <View className="items-center py-24" style={{ transform: [{ scaleY: -1 }] }}>
              <Display light italic className="text-title">
                Say the first thing.
              </Display>
              <Text className="mt-2 text-small text-ink-muted">Only you and {partner.display_name} can read this.</Text>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <View className="my-5 flex-row items-center gap-4" accessibilityRole="header">
                <View className="h-px flex-1 bg-paper-edge" />
                <Text className="font-display-italic text-small text-ink-muted">{item.label}</Text>
                <View className="h-px flex-1 bg-paper-edge" />
              </View>
            ) : item.message.kind === 'call' ? (
              <CallEntry message={item.message} myId={me.id} onCallBack={(m) => void calls.startCall(m)} />
            ) : (
              <Bubble
                message={item.message}
                mine={item.message.sender_id === me.id}
                slot={item.message.sender_id === me.id ? mySlot : partnerSlot}
                authorName={partner.display_name}
                first={item.first}
                last={item.last}
                onRetry={() => retry(item.message.id)}
              />
            )
          }
        />
      )}

      <View style={{ paddingBottom: 8 }} className="px-3 pt-1">
        <Composer
          partnerName={partner.display_name}
          onChange={onComposerChange}
          onSend={(t) => {
            onComposerSent();
            send(t);
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
