/**
 * The parts of Our House that load with the rest of the app (the Connect
 * card, Settings): the art pack's version, manifest and address. Nothing
 * here pulls in three.js; the 3D is in ./index.ts, loaded only in the house.
 */
export * from './pack';
export { housePackBase } from '../api/house';
