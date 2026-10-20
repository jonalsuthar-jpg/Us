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
import { Check, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { EmptyNote, ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Chip } from '../ui/segmented';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/** Shared lists: groceries, a bucket list, things to watch and read. */
export function PlanLists() {
  const { sb, couple, me, partner } = useCouple();
  const c = usePalette();
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

  const add = () => {
    if (!text.trim()) return;
    setError(null);
    void items
      .mutate(() => addListItem(sb, { couple_id: couple.id, list, text, added_by: me.id }))
      .then(() => setText(''))
      .catch(fail);
  };

  return (
    <View className="gap-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {LIST_NAMES.map((n) => {
          const open = all.filter((i) => i.list === n && !i.done_at).length;
          return (
            <Chip key={n} selected={n === list} onPress={() => setList(n)}>
              {`${LISTS[n].emoji} ${LISTS[n].title}${open ? ` · ${open}` : ''}`}
            </Chip>
          );
        })}
      </ScrollView>

      <Sheet className="gap-3">
        <View className="flex-row items-center gap-2">
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
            className="h-11 flex-1 rounded-control border border-paper-edge bg-paper px-4 font-sans text-body text-ink"
          />
          <IconButton label="Add" tone="rose" size="sm" onPress={add}>
            <Plus size={20} color={c.onRose} />
          </IconButton>
        </View>
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {shown.length === 0 && !items.loading ? (
          <EmptyNote title={`Nothing on ${meta.title.toLowerCase()} yet`}>{`Add the first thing. ${partner.display_name} sees it right away.`}</EmptyNote>
        ) : (
          shown.map((i) => (
            <View key={i.id} className="flex-row items-center gap-3 border-b border-paper-edge py-2.5">
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!i.done_at }}
                accessibilityLabel={i.text}
                hitSlop={8}
                onPress={() => void items.mutate(() => setListItemDone(sb, i.id, i.done_at ? null : me.id)).catch(fail)}
                className={cn('h-6 w-6 items-center justify-center rounded-full border', i.done_at ? 'border-sage-500 bg-sage-500' : 'border-plum-300')}
              >
                {i.done_at ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
              </Pressable>
              <View className="flex-1">
                <Text className={i.done_at ? 'text-ink-muted line-through' : ''}>{i.text}</Text>
                <Text className="text-micro text-ink-muted">
                  {i.done_at ? `${meta.doneLabel} by ${nameOf(i.done_by)}` : `Added by ${nameOf(i.added_by)}`}
                </Text>
              </View>
              <IconButton label={`Remove ${i.text}`} size="sm" onPress={() => void items.mutate(() => deleteListItem(sb, i.id)).catch(fail)}>
                <X size={16} color={c.inkMuted} />
              </IconButton>
            </View>
          ))
        )}

        {doneCount > 0 ? (
          <Button
            variant="quiet"
            size="sm"
            className="self-end"
            onPress={() =>
              Alert.alert(`Clear ${doneCount} ticked ${doneCount === 1 ? 'item' : 'items'}?`, undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', onPress: () => void items.mutate(() => clearDoneItems(sb, couple.id, list)).catch(fail) },
              ])
            }
          >
            Clear ticked
          </Button>
        ) : null}
      </Sheet>
    </View>
  );
}
