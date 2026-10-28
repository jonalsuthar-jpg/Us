const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * Two libraries each name the ML Kit models to download at install time
 * (our sticker cutout: subject_segment; expo-camera: barcode_ui), and
 * Android won't merge two values for one key. Say it once in the app's own
 * manifest, which wins over both.
 */
module.exports = function withMlkitModels(config, { models }) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    const name = 'com.google.mlkit.vision.DEPENDENCIES';
    app['meta-data'] = (app['meta-data'] ?? []).filter((m) => m.$['android:name'] !== name);
    app['meta-data'].push({ $: { 'android:name': name, 'android:value': models.join(','), 'tools:replace': 'android:value' } });
    return c;
  });
};
