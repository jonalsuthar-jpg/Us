/**
 * Our House: a two-floor home with a garden and a pool, where we both walk
 * around and see each other. Imported only by the house screens, so three.js
 * never loads with the rest of the app.
 */
export * from './layout';
export * from './presence';
export * from './use-house';
export * from './use-game';
export * from './items';
export * from './store';
export { houseApi, housePackBase, housePhotos } from '../api/house';
export * from './pack';
export { Avatar, LOOKS, type AvatarLook } from './scene/avatar';
export { clipFor } from './scene/avatar-real';
export type { HousePhoto } from './scene/items';
export { QUALITIES, type Quality } from './scene/materials';
export { createControls, HouseWorld, orbitBy, setView, tapAt, zoomBy, type HouseCmd, type HouseControls, type HudState, type WorldProps } from './scene/world';
