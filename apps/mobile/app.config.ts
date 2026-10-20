import type { ConfigContext, ExpoConfig } from 'expo/config';

const PAPER = '#FCFAFB';
const PLUM = '#241933';

const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? '88a0178c-23db-40f1-b16c-0e953b4dfe47';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Us',
  slug: 'us',
  owner: 'jonalsuthar',
  scheme: 'us',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: PAPER,
  icon: './assets/images/icon.png',
  // Over-the-air updates (EAS Update). The fingerprint changes whenever native
  // code does, so an update only ever reaches builds that can run it.
  runtimeVersion: { policy: 'fingerprint' },
  updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 },
  ios: {
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'com.jonalsuthar.us',
    supportsTablet: true,
    infoPlist: {
      UIBackgroundModes: ['audio', 'voip', 'remote-notification'],
    },
  },
  android: {
    package: process.env.ANDROID_PACKAGE ?? 'com.jonalsuthar.us',
    adaptiveIcon: { foregroundImage: './assets/images/icon.png', backgroundColor: PLUM },
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.POST_NOTIFICATIONS',
      // react-native-incall-manager: proximity sensor (screen off at your ear) during voice calls.
      'android.permission.WAKE_LOCK',
    ],
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-splash-screen', { backgroundColor: PAPER, image: './assets/images/icon.png', imageWidth: 120 }],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 24,
          // No R8 shrinking: WebRTC's native code looks up Java classes by name from
          // JNI_OnLoad, which R8 can't see, and a stripped class crashes the app at launch.
          enableMinifyInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
          extraProguardRules: ['-keep class org.webrtc.** { *; }', '-dontwarn org.webrtc.**'].join('\n'),
        },
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Us lets you add photos to the memories you keep together.',
        cameraPermission: 'Us uses your camera for video calls and for photos of your memories.',
      },
    ],
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
        smallIconAccentColor: '#F5547C',
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    eas: { projectId: EAS_PROJECT_ID },
  },
});
