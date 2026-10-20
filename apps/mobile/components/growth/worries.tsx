import { addWorry, deleteWorry, listWorries, setWorryShared } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { EmptyNote, ErrorNote, SectionTitle } from '../module-screen';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { PrivacyBadge } from '../ui/privacy';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function GrowthWorries() {
  const { sb, me, partner } = useCouple();
  const worries = useCoupleData('growth:worries', () => listWorries(sb), [sb]);
  const all = worries.data ?? [];
  const mine = all.filter((w) => w.owner_id === me.id);
  const fromPartner = all.filter((w) => w.owner_id !== me.id);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);

  return (
    <View className="gap-6">
      <Sheet className="gap-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Display className="text-heading">Set it down here</Display>
          <PrivacyBadge privacy="private" partnerName={partner.display_name} />
        </View>
        <Field
          label="What’s worrying you?"
          value={body}
          onChangeText={setBody}
          multiline
          inputClassName="h-28 py-3"
          maxLength={5000}
          hint={`Private by default. You can choose to share one with ${partner.display_name} later — or never.`}
        />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button
          disabled={!body.trim()}
          onPress={() =>
            void worries
              .mutate(() => addWorry(sb, { owner_id: me.id, body: body.trim() }))
              .then(() => setBody(''))
              .catch(fail)
          }
        >
          Keep it here
        </Button>
      </Sheet>

      {fromPartner.length > 0 ? (
        <View className="gap-3">
          <SectionTitle>{`${partner.display_name} shared with you`}</SectionTitle>
          {fromPartner.map((w) => (
            <Sheet key={w.id} tone="note" accent="teal" pad="sm">
              <Text>{w.body}</Text>
              <Text className="mt-2 text-micro text-ink-muted">Shared {day(w.shared_at ?? w.created_at)}</Text>
            </Sheet>
          ))}
        </View>
      ) : null}

      <View className="gap-3">
        <SectionTitle>Yours</SectionTitle>
        {mine.length === 0 ? (
          <EmptyNote title="Nothing here">That’s allowed too.</EmptyNote>
        ) : (
          mine.map((w) => (
            <Sheet key={w.id} tone={w.shared_at ? 'note' : 'inset'} accent={w.shared_at ? 'teal' : 'none'} pad="sm" className="gap-2">
              <Text>{w.body}</Text>
              <Text className="text-micro text-ink-muted">
                {day(w.created_at)}
                {w.shared_at ? ` · shared with ${partner.display_name}` : ' · only you'}
              </Text>
              <View className="flex-row gap-2">
                <Button
                  size="sm"
                  variant="quiet"
                  className="px-0"
                  onPress={() => {
                    const toggle = () => void worries.mutate(() => setWorryShared(sb, w.id, !w.shared_at)).catch(fail);
                    if (w.shared_at) return toggle();
                    Alert.alert(`Share with ${partner.display_name}?`, 'They’ll be able to read it. You can make it private again later.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Share', onPress: toggle },
                    ]);
                  }}
                >
                  {w.shared_at ? 'Make private' : `Share with ${partner.display_name}`}
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  onPress={() =>
                    Alert.alert('Delete this for good?', undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => void worries.mutate(() => deleteWorry(sb, w.id)).catch(fail) },
                    ])
                  }
                >
                  Delete
                </Button>
              </View>
            </Sheet>
          ))
        )}
      </View>
    </View>
  );
}
