import { ArrowUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';

export function Composer({
  partnerName,
  onSend,
  onChange,
}: {
  partnerName: string;
  onSend: (text: string) => void;
  onChange: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const c = usePalette();
  const canSend = text.trim().length > 0;
  return (
    <View className="flex-row items-end gap-2 rounded-[26px] border border-paper-edge bg-paper-raised p-1.5 pl-4">
      <TextInput
        accessibilityLabel={`Message ${partnerName}`}
        placeholder={`Message ${partnerName}…`}
        placeholderTextColor={c.placeholder}
        multiline
        maxLength={4000}
        value={text}
        onChangeText={(t) => {
          setText(t);
          onChange(t);
        }}
        className="max-h-[140px] flex-1 py-2.5 font-sans text-body text-ink"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={() => {
          onSend(text.trim());
          setText('');
        }}
        className={cn('h-10 w-10 items-center justify-center rounded-full bg-rose-600 active:bg-rose-700', !canSend && 'opacity-30')}
      >
        <ArrowUp size={20} color="#fff" strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}
