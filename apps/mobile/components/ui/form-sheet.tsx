import { addDays, fromDateKey, toDateKey } from '@us/shared';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './button';
import { usePalette } from './palette';
import { Display, Text } from './text';

/** A page sheet for forms — rises from the bottom, swipe or ✕ to close. */
export function FormSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-paper">
        <View className="flex-row items-center justify-between px-5 pb-2 pt-5">
          <Display className="text-heading">{title}</Display>
          <IconButton label="Close" size="sm" onPress={onClose}>
            <X size={20} color={c.inkSoft} />
          </IconButton>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 px-5" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Pick a day by stepping, without a native date-picker dependency. */
export function DateStepper({ label, value, onChange }: { label: string; value: string; onChange: (key: string) => void }) {
  const c = usePalette();
  const d = fromDateKey(value);
  const today = toDateKey(new Date());
  return (
    <View className="gap-1.5">
      <Text className="font-sans-medium text-small">{label}</Text>
      <View className="h-12 flex-row items-center rounded-control border border-paper-edge bg-paper-raised">
        <IconButton label="Previous day" size="sm" onPress={() => onChange(toDateKey(addDays(d, -1)))}>
          <ChevronLeft size={20} color={c.ink} />
        </IconButton>
        <Text className="flex-1 text-center" accessibilityLiveRegion="polite">
          {value === today ? 'Today · ' : ''}
          {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}
        </Text>
        <IconButton label="Next day" size="sm" onPress={() => onChange(toDateKey(addDays(d, 1)))}>
          <ChevronRight size={20} color={c.ink} />
        </IconButton>
      </View>
    </View>
  );
}

/** "7:30", "19.30", "1930" → "19:30"; null if it isn't a time. */
export function parseTime(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
