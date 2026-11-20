/**
 * Our House: a two-floor home with a garden and a pool, where we both walk
 * around and see each other. Imported only by the house screens, so three.js
 * never loads with the rest of the app.
 */
export * from './layout';
export * from './presence';
export * from './use-house';
export { Avatar, LOOKS, type AvatarLook } from './scene/avatar';
export { QUALITIES, type Quality } from './scene/materials';
export { createControls, HouseWorld, orbitBy, tapAt, zoomBy, type HouseControls, type WorldProps } from './scene/world';
