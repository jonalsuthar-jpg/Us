import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { cn } from './cn';
import { Text } from './text';
import { usePalette } from './palette';

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  inputClassName?: string;
}

export function Field({ label, hint, error, className, inputClassName, onFocus, onBlur, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const c = usePalette();
  return (
    <View className={cn('gap-1.5', className)}>
      <Text className="font-sans-medium text-small">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={c.placeholder}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          'h-12 rounded-control border bg-paper-raised px-4 font-sans text-body text-ink',
          error ? 'border-rose-600' : focused ? 'border-rose-400' : 'border-paper-edge',
          inputClassName,
        )}
        {...props}
      />
      {error ? (
        <Text accessibilityRole="alert" className="text-small text-rose-700">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-small text-ink-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
