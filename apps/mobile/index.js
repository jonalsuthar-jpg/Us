/**
 * App entry. Installs the crash guard before anything else loads, then the
 * chat's crypto (random numbers, key store), then hands over to expo-router.
 */
import './lib/crash-guard';
import './lib/chat-crypto';
import 'expo-router/entry';
