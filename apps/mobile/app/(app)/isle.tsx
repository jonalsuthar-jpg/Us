import { useFeature } from '@us/shared/react';
import { useLocalSearchParams } from 'expo-router';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, Platform, StatusBar, View } from 'react-native';
import { FeatureOff } from '@/components/feature-off';

/**
 * Isle, full screen and sideways: the game the two of us share, or with
 * ?solo=1 my game alone against three bots. The board (three.js) is required
 * only once this screen opens, so it costs nothing at app start.
 */
export default function IsleScreen() {
  const on = useFeature('isle');
  const { solo } = useLocalSearchParams<{ solo?: string }>();
  const [Table, setTable] = useState<ComponentType<{ solo?: boolean }> | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  if (loadError) throw loadError;

  useEffect(() => {
    if (!on) return;
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    StatusBar.setHidden(true, 'fade');
    if (Platform.OS === 'android') void NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    // Let the rotation start before the heavy require blocks the JS thread.
    const t = setTimeout(() => {
      try {
        const { IsleView } = require('@/components/isle/isle-view') as typeof import('@/components/isle/isle-view');
        setTable(() => IsleView);
      } catch (e) {
        setLoadError(e instanceof Error ? e : new Error(String(e)));
      }
    }, 50);
    return () => {
      clearTimeout(t);
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      StatusBar.setHidden(false, 'fade');
      if (Platform.OS === 'android') void NavigationBar.setVisibilityAsync('visible').catch(() => {});
    };
  }, [on]);

  if (!on) return <FeatureOff />;
  if (!Table) {
    return (
      <View className="flex-1 items-center justify-center bg-[#A9D8E8]">
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }
  return <Table solo={solo === '1'} />;
}
