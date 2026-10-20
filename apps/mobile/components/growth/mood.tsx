import { addMood, deleteMood, listMyMoods, moodLabel, MOODS } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { EmptyNote, ErrorNote, SectionTitle } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { usePalette } from '../ui/palette';
import { PrivacyBadge } from '../ui/privacy';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

const TONE = ['bg-plum-300', 'bg-plum-200', 'bg-gold-200', 'bg-sage-300', 'bg-sage-400'];

export function GrowthMood() {
  const { sb, me, partner, channel } = useCouple();
  const c = usePalette();
  const moods = useCoupleData('growth:my-moods', () => listMyMoods(sb), [sb]);
  const list = moods.data ?? [];
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [nudge, setNudge] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const strip = [...list].slice(0, 14).reverse();

  return (
    <View className="gap-6">
      <Sheet className="gap-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Display className="text-heading">How are you, really?</Display>
          <PrivacyBadge privacy="private" partnerName={partner.display_name} />
        </View>
        <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="How you feel">
          {MOODS.map((m, i) => (
            <Pressable
              key={m.score}
              accessibilityRole="radio"
              accessibilityState={{ checked: score === m.score }}
              onPress={() => setScore(m.score)}
              className={cn('flex-1 items-center gap-2 rounded-control border py-3', score === m.score ? 'border-plum-300 bg-paper-sunken' : 'border-paper-edge')}
            >
              <View className={cn('h-5 w-5 rounded-full', TONE[i])} />
              <Text className={cn('text-micro', score === m.score ? 'text-ink' : 'text-ink-soft')}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Anything on your mind? (optional)" value={note} onChangeText={setNote} multiline inputClassName="h-24 py-3" maxLength={2000} hint="Only you will ever see this note." />
        <View className="flex-row items-center gap-3 rounded-control bg-sage-50 p-3">
          <View className="flex-1">
            <Text className="text-small">Let {partner.display_name} know I could use a little extra care.</Text>
            <Text className="text-micro text-ink-soft">They’ll get a soft nudge. Never your mood or your note.</Text>
          </View>
          <Switch value={nudge} onValueChange={setNudge} trackColor={{ true: c.sage, false: c.edge }} accessibilityLabel="Nudge my partner" />
        </View>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {sent && !score ? <Text className="text-small text-sage-700">{sent}</Text> : null}
        <Button
          disabled={!score}
          onPress={() =>
            void moods
              .mutate(() => addMood(sb, { owner_id: me.id, score: score!, note: note.trim() || null, nudge }))
              .then(() => {
                if (nudge) channel.sendChanged('growth:nudges');
                setSent(nudge ? `Saved. ${partner.display_name} got a gentle nudge — nothing else.` : 'Saved, just for you.');
                setScore(null);
                setNote('');
                setNudge(false);
              })
              .catch((e: Error) => setError(e.message))
          }
        >
          Check in
        </Button>
      </Sheet>

      <View className="gap-3">
        <SectionTitle>Your last few weeks</SectionTitle>
        {list.length === 0 ? (
          <EmptyNote title="No check-ins yet">A quiet record, just for you.</EmptyNote>
        ) : (
          <>
            <View className="h-16 flex-row items-end gap-1" accessible accessibilityLabel={`Your last ${strip.length} check-ins`}>
              {strip.map((m) => (
                <View key={m.id} className={cn('flex-1 rounded-t-hair', TONE[m.score - 1])} style={{ height: `${m.score * 20}%` }} />
              ))}
            </View>
            <Sheet pad="none">
              {list.slice(0, 10).map((m, i) => (
                <View key={m.id} className={cn('flex-row items-start gap-3 px-4 py-3', i > 0 && 'border-t border-paper-edge')}>
                  <View className={cn('mt-1.5 h-2.5 w-2.5 rounded-full', TONE[m.score - 1])} />
                  <View className="flex-1">
                    <Text className="text-small">
                      {moodLabel(m.score)}
                      <Text className="text-small text-ink-muted"> · {new Date(m.created_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                      {m.nudge_partner ? <Text className="text-small text-sage-700"> · nudged</Text> : null}
                    </Text>
                    {m.note ? (
                      <Text numberOfLines={2} className="mt-0.5 text-small text-ink-soft">
                        {m.note}
                      </Text>
                    ) : null}
                  </View>
                  <IconButton label="Delete check-in" size="sm" onPress={() => void moods.mutate(() => deleteMood(sb, m.id)).catch((e: Error) => setError(e.message))}>
                    <X size={16} color={c.inkSoft} />
                  </IconButton>
                </View>
              ))}
            </Sheet>
          </>
        )}
      </View>
    </View>
  );
}
