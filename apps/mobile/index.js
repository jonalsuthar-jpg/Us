/**
 * App entry. Installs secure random numbers and the crash guard before
 * anything else loads, then the chat's key store, then hands over to
 * expo-router.
 */
import './lib/random-polyfill';
import './lib/crash-guard';
import './lib/chat-crypto';
import 'expo-router/entry';
