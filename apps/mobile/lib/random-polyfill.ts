import { getRandomValues } from 'expo-crypto';

/**
 * Hermes has no Web Crypto. Encrypted chat (and uuid) only need
 * getRandomValues, so the OS's secure generator is installed here, before
 * anything else loads: index.js imports this first.
 */
const g = globalThis as { crypto?: Partial<Crypto> };
g.crypto ??= {};
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = getRandomValues as Crypto['getRandomValues'];
