/**
 * App entry. Installs the crash guard before anything else loads, then hands
 * over to expo-router.
 */
import './lib/crash-guard';
import 'expo-router/entry';
