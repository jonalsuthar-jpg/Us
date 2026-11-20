import { packSize } from '@us/shared/house/light';
import { Alert, View } from 'react-native';
import { removePackNow } from '@/lib/house-pack';
import { useHousePack } from '@/lib/use-house-pack';
import { Button } from '../ui/button';
import { Text } from '../ui/text';

/** Settings → Storage: the realistic house takes room on the phone; this gives it back. */
export function HouseStorage() {
  const pack = useHousePack();
  if (pack.kind !== 'ready') {
    return <Text className="text-small text-ink-soft">Our house uses no space on this phone. Get the real house from the Connect tab.</Text>;
  }
  return (
    <View className="gap-2">
      <Text className="text-small text-ink-soft">{`The real house uses ${packSize(pack.bytes)} on this phone. Everything you did in it is saved, and comes back if you download it again.`}</Text>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onPress={() =>
          Alert.alert('Remove the real house?', `This frees ${packSize(pack.bytes)}. You can still go in; it’s the simple house until you download it again.`, [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: removePackNow },
          ])
        }
      >
        Remove the real house
      </Button>
    </View>
  );
}
