import { MODULES, type ModuleId } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { Tabs } from 'expo-router';
import { HeartHandshake, House, MessageCircleHeart, NotebookPen, Sparkles, Sprout } from 'lucide-react-native';
import { usePalette } from '@/components/ui/palette';

const ICONS: Record<ModuleId, typeof MessageCircleHeart> = {
  talk: MessageCircleHeart,
  connect: HeartHandshake,
  plan: NotebookPen,
  memory: Sparkles,
  growth: Sprout,
};

export default function AppTabs() {
  const { unread } = useCouple();
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.scheme === 'dark' ? c.rose : c.roseStrong,
        tabBarInactiveTintColor: c.inkMuted,
        tabBarStyle: { backgroundColor: c.paperRaised, borderTopColor: c.edge, elevation: 12 },
        // Six tabs: a touch smaller so every label fits on narrow phones.
        tabBarLabelStyle: { fontFamily: 'WorkSans_500Medium', fontSize: 10 },
        sceneStyle: { backgroundColor: c.paper },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <House size={22} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      {MODULES.map((m) => {
        const Icon = ICONS[m.id];
        return (
          <Tabs.Screen
            key={m.id}
            name={m.id}
            options={{
              title: m.title,
              tabBarIcon: ({ color, focused }) => <Icon size={22} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
              tabBarBadge: m.id === 'talk' && unread > 0 ? unread : undefined,
              tabBarBadgeStyle: { backgroundColor: c.roseStrong, fontSize: 11 },
            }}
          />
        );
      })}
    </Tabs>
  );
}
