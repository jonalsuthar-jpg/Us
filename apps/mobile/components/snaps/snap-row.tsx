import { firstUnseen, type Snap } from '@us/shared';
import { useCouple, useSnaps } from '@us/shared/react';
import { Camera, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';
import { PostSnap } from './post-snap';
import { StoryViewer } from './story-viewer';

/** Today's snaps: my partner's story and mine, each lasting 24 hours. */
export function SnapRow() {
  const { partner } = useCouple();
  const c = usePalette();
  const snaps = useSnaps();
  const [viewing, setViewing] = useState<'mine' | 'partner' | null>(null);
  const [posting, setPosting] = useState(false);

  const d = snaps.data;
  const story = viewing && d ? d[viewing] : null;
  // The story ran out (expired, or I deleted the last one): close it.
  useEffect(() => {
    if (viewing && d && !d[viewing].length) setViewing(null);
  }, [viewing, d]);

  const theirs = d?.partner ?? [];
  const mine = d?.mine ?? [];
  const unseen = theirs.some((s) => !s.seen_at);
  const myLatest = mine.at(-1);

  return (
    <Sheet pad="sm" className="flex-row items-center gap-4">
      <Ring
        label={theirs.length ? `${partner.display_name}’s snaps${unseen ? ', new' : ''}` : `${partner.display_name} hasn’t shared a snap`}
        snap={theirs.at(-1)}
        state={!theirs.length ? 'empty' : unseen ? 'new' : 'seen'}
        caption={partner.display_name}
        onPress={theirs.length ? () => setViewing('partner') : undefined}
      />
      <Ring
        label={mine.length ? 'Your snaps' : 'Share a snap'}
        snap={myLatest}
        state={mine.length ? 'seen' : 'add'}
        caption={myLatest?.seen_at ? `Seen${myLatest.reaction ? ` ${myLatest.reaction}` : ''}` : 'You'}
        onPress={mine.length ? () => setViewing('mine') : () => setPosting(true)}
      />
      <View className="flex-1">
        <Text className="font-sans-medium text-micro text-rose-700">Snaps · 24 hours</Text>
        <Text className="text-small text-ink-soft">
          {unseen ? `${partner.display_name} shared something new.` : 'A photo of your day. Gone tomorrow, unless you keep it.'}
        </Text>
      </View>
      <IconButton label="Share a snap" tone="rose" onPress={() => setPosting(true)}>
        <Camera size={20} color={c.roseStrong} />
      </IconButton>

      <PostSnap open={posting} onClose={() => setPosting(false)} mutate={snaps.mutate} />
      <StoryViewer
        snaps={story}
        start={story && viewing === 'partner' ? firstUnseen(story) : 0}
        kept={d?.kept ?? new Set()}
        onClose={() => setViewing(null)}
        mutate={snaps.mutate}
      />
    </Sheet>
  );
}

function Ring({
  label,
  snap,
  state,
  caption,
  onPress,
}: {
  label: string;
  snap?: Snap;
  state: 'new' | 'seen' | 'empty' | 'add';
  caption: string;
  onPress?: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!onPress} onPress={onPress} className="w-16 items-center gap-1">
      <View
        className={cn(
          'h-14 w-14 items-center justify-center rounded-full p-[3px]',
          state === 'new' ? 'bg-rose-500' : state === 'seen' ? 'bg-plum-200' : 'border-2 border-dashed border-plum-200',
        )}
      >
        {snap?.url ? (
          <Image source={{ uri: snap.url }} className="h-full w-full rounded-full border-2 border-paper-raised" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center rounded-full bg-paper-sunken">
            {state === 'add' ? <Plus size={20} color={c.inkMuted} /> : null}
          </View>
        )}
      </View>
      <Text className="w-full text-center text-micro text-ink-soft" numberOfLines={1}>
        {caption}
      </Text>
    </Pressable>
  );
}
