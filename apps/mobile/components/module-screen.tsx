import { moduleById, type ModuleId } from '@us/shared';
import { router } from 'expo-router';
import { HeartHandshake, MessageCircleHeart, NotebookPen, Settings, Sparkles } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './ui/button';
import { cn } from './ui/cn';
import { usePalette } from './ui/palette';
import { Display, Text } from './ui/text';

const MODULE_ICON: Record<ModuleId, typeof Sparkles> = {
  talk: MessageCircleHeart,
  connect: HeartHandshake,
  plan: NotebookPen,
  memory: Sparkles,
};

export const MODULE_ACCENT: Record<ModuleId, { wash: string; ink: string; sheet: 'rose' | 'teal' | 'plum' | 'gold' | 'sage' }> = {
  talk: { wash: 'bg-rose-100', ink: 'text-rose-700', sheet: 'rose' },
  connect: { wash: 'bg-teal-100', ink: 'text-teal-700', sheet: 'teal' },
  plan: { wash: 'bg-plum-100', ink: 'text-plum-600', sheet: 'plum' },
  memory: { wash: 'bg-gold-100', ink: 'text-gold-700', sheet: 'gold' },
};

/** Scrolling screen with the module's title, tagline and colour wash. */
export function ModuleScreen({
  id,
  aside,
  children,
  refreshing,
  onRefresh,
}: {
  id: ModuleId;
  aside?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const mod = moduleById(id);
  const insets = useSafeAreaInsets();
  const a = MODULE_ACCENT[id];
  const c = usePalette();
  const Icon = MODULE_ICON[id];
  const iconColor = { talk: c.onRose, connect: c.onTeal, plan: c.onPlum, memory: c.onGold }[id];
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40 }}
      contentContainerClassName="gap-6 px-5"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      <View>
        <View className="flex-row items-center gap-3">
          <View className={cn('h-11 w-11 items-center justify-center rounded-2xl', a.wash)}>
            <Icon size={21} color={iconColor} strokeWidth={2.1} />
          </View>
          <Display className="flex-1 text-[34px] leading-[40px]" numberOfLines={1}>
            {mod.title}
          </Display>
          <IconButton label="Settings" size="sm" tone="raised" onPress={() => router.push('/settings')}>
            <Settings size={19} color={c.inkSoft} />
          </IconButton>
        </View>
        <Display light italic className="mt-2.5 text-lead text-ink-soft">
          {mod.tagline}
        </Display>
        {aside ? <View className="mt-4">{aside}</View> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function EmptyNote({ title, children }: { title: string; children?: string }) {
  return (
    <View className="items-center rounded-sheet border border-dashed border-paper-edge px-6 py-8">
      <Display italic className="text-center text-lead">
        {title}
      </Display>
      {children ? <Text className="mt-2 text-center text-small text-ink-soft">{children}</Text> : null}
    </View>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" className="text-small text-rose-700">
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Display className="text-lead">{children}</Display>;
}
