import type { ConfigContext, ExpoConfig } from 'expo/config';

const PAPER = '#FAF6F1';
const PLUM = '#2A1F2D';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Us',
  slug: 'us',
  scheme: 'us',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: PAPER,
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'com.example.us',
    supportsTablet: true,
    infoPlist: {
      UIBackgroundModes: ['audio', 'voip', 'remote-notification'],
    },
  },
  android: {
    package: process.env.ANDROID_PACKAGE ?? 'com.example.us',
    adaptiveIcon: { foregroundImage: './assets/images/icon.png', backgroundColor: PLUM },
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-splash-screen', { backgroundColor: PAPER, image: './assets/images/icon.png', imageWidth: 120 }],
    ['expo-build-properties', { android: { minSdkVersion: 24 } }],
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission: 'Us uses your camera for video calls with your partner.',
        microphonePermission: 'Us uses your microphone for calls with your partner.',
      },
    ],
    [
      'onesignal-expo-plugin',
      {
        mode: process.env.ONESIGNAL_MODE ?? 'development',
        // The app's own chime, bundled for iOS + Android res/raw (see scripts/generate-sounds.mjs).
        sounds: ['./assets/sounds/us_chime.wav', './assets/sounds/us_ring.wav'],
        smallIcons: ['./assets/images/ic_stat_onesignal_default.png'],
        smallIconAccentColor: '#C8686B',
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
