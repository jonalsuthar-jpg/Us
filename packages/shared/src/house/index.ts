/**
 * Our House: a two-floor home with a garden and a pool, where we both walk
 * around and see each other. Imported only by the house screens, so three.js
 * never loads with the rest of the app.
 */
export * from './layout';
export * from './presence';
export * from './use-house';
export * from './use-game';
export * from './use-loading';
export * from './sky';
export * from './sound';
export * from './items';
export * from './store';
export { houseApi, housePackBase, housePhotos, saveHousePhoto } from '../api/house';
export * from './pack';
export { Avatar, LOOKS, type AvatarLook } from './scene/avatar';
export { clipFor } from './scene/avatar-real';
export type { HousePhoto } from './scene/items';
export { QUALITIES, type Quality } from './scene/materials';
export type { FunHud, FunOption, FunPanel, HouseLetters } from './scene/fun';
export { CAMERA_LABEL, CAMERA_VIEWS, createControls, HouseWorld, nextCameraView, orbitBy, setView, tapAt, zoomBy, type CameraView, type HouseCmd, type HouseControls, type HudState, type WorldProps } from './scene/world';
