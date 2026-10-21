import { MODULES, type ModuleId } from '@us/shared';
import { useCouple } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { TopTabs, type MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { HeartHandshake, House, MessageCircleHeart, NotebookPen, Sparkles, Sprout } from 'lucide-react-native';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '@/components/ui/palette';
import { Text } from '@/components/ui/text';

const ICONS: Record<'home' | ModuleId, typeof MessageCircleHeart> = {
  home: House,
  talk: MessageCircleHeart,
  connect: HeartHandshake,
  plan: NotebookPen,
  memory: Sparkles,
  growth: Sprout,
};

/**
 * The tabs sit in a native pager, so you can swipe between them as well as
 * tap, and every switch slides like it does in WhatsApp.
 */
export default function AppTabs() {
  const c = usePalette();
  return (
    <TopTabs
      tabBarPosition="bottom"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true,
        // Each tab mounts when first visited; neighbours load just ahead so a swipe never lands on a blank page.
        lazy: true,
        lazyPreloadDistance: 1,
        sceneStyle: { backgroundColor: c.paper },
      }}
      style={{ backgroundColor: c.paper }}
    >
      <TopTabs.Screen name="home" options={{ title: 'Home' }} />
      {MODULES.map((m) => (
        <TopTabs.Screen key={m.id} name={m.id} options={{ title: m.title }} />
      ))}
    </TopTabs>
  );
}

function TabBar({ state, descriptors, emitter, jumpTo, position }: MaterialTopTabBarProps) {
  const { unread } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const active = c.scheme === 'dark' ? c.rose : c.roseStrong;
  return (
    <View style={{ backgroundColor: c.paperRaised, borderTopColor: c.edge, borderTopWidth: 1, paddingBottom: insets.bottom, elevation: 12 }}>
      <View className="flex-row">
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const options = descriptors[route.key]?.options ?? {};
          const Icon = ICONS[route.name as keyof typeof ICONS] ?? House;
          const title = options.title ?? route.name;
          const badge = route.name === 'talk' && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null;
          // The indicator follows your finger: it fades in as the pager reaches this tab.
          const reach = position.interpolate({
            inputRange: [i - 1, i, i + 1],
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
          });
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${title}, ${badge} unread` : title}
              onPress={() => {
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (focused || event.defaultPrevented) return;
                void Haptics.selectionAsync().catch(() => {});
                jumpTo(route.key);
              }}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              className="flex-1 items-center gap-0.5 pb-1.5 pt-2"
            >
              <Animated.View
                style={{ position: 'absolute', top: 0, height: 3, width: 32, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: active, opacity: reach }}
              />
              <View>
                <Icon size={22} color={focused ? active : c.inkMuted} strokeWidth={focused ? 2.25 : 1.75} />
                {badge ? (
                  <View className="absolute -right-2.5 -top-1.5 min-w-[18px] items-center rounded-full px-1" style={{ backgroundColor: c.roseStrong }}>
                    <Text className="font-sans-semibold text-[10px] leading-[16px] text-white">{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} className="font-sans-medium text-[10px] leading-[14px]" style={{ color: focused ? active : c.inkMuted }}>
                {title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
