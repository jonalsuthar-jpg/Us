import { useFeature } from '@us/shared/react';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, Platform, StatusBar, View } from 'react-native';
import { FeatureOff } from '@/components/feature-off';

/**
 * Our House, full screen and sideways. The 3D view (three.js and the house)
 * is required only once this screen opens, so it costs nothing at app start
 * and nothing for anyone who never comes in.
 */
export default function HouseScreen() {
  const on = useFeature('house');
  const [View3D, setView3D] = useState<ComponentType | null>(null);
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
        const { HouseView } = require('@/components/house/house-view') as typeof import('@/components/house/house-view');
        setView3D(() => HouseView);
      } catch (e) {
        // Shown by this screen's error boundary, instead of closing the app from a timer.
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
  if (!View3D) {
    return (
      <View className="flex-1 items-center justify-center bg-[#BFDDF2]">
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }
  return <View3D />;
}
