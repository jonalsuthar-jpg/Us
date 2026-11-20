import { useSyncExternalStore } from 'react';
import { packState, subscribePack, type PackState } from './house-pack';

/** The house pack on this phone, live: none, downloading, ready or an error. */
export function useHousePack(): PackState {
  return useSyncExternalStore(subscribePack, packState, packState);
}
