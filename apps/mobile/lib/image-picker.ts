import * as ImagePicker from 'expo-image-picker';
import { withoutLock } from './app-lock';

/**
 * expo-image-picker, except that leaving Us for the gallery or camera never
 * trips the app lock on the way back (see app-lock.ts).
 */
export * from 'expo-image-picker';

export const launchImageLibraryAsync: typeof ImagePicker.launchImageLibraryAsync = (options) =>
  withoutLock(() => ImagePicker.launchImageLibraryAsync(options));
export const launchCameraAsync: typeof ImagePicker.launchCameraAsync = (options) => withoutLock(() => ImagePicker.launchCameraAsync(options));
export const requestCameraPermissionsAsync: typeof ImagePicker.requestCameraPermissionsAsync = () =>
  withoutLock(() => ImagePicker.requestCameraPermissionsAsync());
export const requestMediaLibraryPermissionsAsync: typeof ImagePicker.requestMediaLibraryPermissionsAsync = (writeOnly) =>
  withoutLock(() => ImagePicker.requestMediaLibraryPermissionsAsync(writeOnly));
