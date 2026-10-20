import { Alert } from 'react-native';

/**
 * In release builds an uncaught JS error closes the app with no explanation.
 * This catches fatal errors and shows the message instead, so a screenshot
 * is enough to diagnose a crash on someone's phone. Non-fatal errors keep
 * React Native's default behaviour.
 */
type Handler = (error: unknown, isFatal?: boolean) => void;
const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): Handler; setGlobalHandler(h: Handler): void } };

if (g.ErrorUtils) {
  const fallback = g.ErrorUtils.getGlobalHandler();
  let shown = false;
  g.ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal || __DEV__) return fallback(error, isFatal);
    if (shown) return;
    shown = true;
    const e = error as { message?: string; stack?: string };
    const detail = `${e?.message ?? String(error)}\n\n${(e?.stack ?? '').split('\n').slice(0, 8).join('\n')}`;
    Alert.alert('Us hit a problem while starting', `Please send a screenshot of this.\n\n${detail}`.slice(0, 1800));
  });
}
