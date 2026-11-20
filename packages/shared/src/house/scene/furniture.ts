import type { ItemModel } from '../items';

/**
 * Which real model (CC0, Poly Haven) draws a catalog item, and how it's
 * fitted to the item's footprint in items.ts. Sizes come from
 * scripts/blender/measure_models.py; models face +z like the catalog.
 *
 * A model is first stood on the floor and centred (by its measured bottom
 * and middle), then scaled, then turned by `yaw`, then lifted by `lift`.
 * Items not listed keep their box shapes (scene/items.tsx).
 */
export interface RealModel {
  asset: string;
  /** Measured: bottom, middle x, middle z, in the model's own units. */
  bottom: number;
  cx: number;
  cz: number;
  scale: [number, number, number];
  yaw?: number;
  lift?: number;
  /** The TV keeps its own screen in front of the real cabinet. */
  keepScreen?: boolean;
}

const Q = Math.PI / 2;

export const REAL_MODELS: Partial<Record<ItemModel, RealModel>> = {
  sofa: { asset: 'sofa_03', bottom: 0.001, cx: 0, cz: -0.001, scale: [0.95, 0.95, 1.0] },
  armchair: { asset: 'modern_arm_chair_01', bottom: 0, cx: 0.003, cz: -0.082, scale: [1.05, 0.95, 0.92] },
  coffeeTable: { asset: 'modern_coffee_table_01', bottom: 0, cx: 0, cz: 0, scale: [1.17, 1.1, 0.92], yaw: Q },
  tvUnit: { asset: 'modern_wooden_cabinet', bottom: 0, cx: 0, cz: -0.01, scale: [0.9, 0.74, 0.87], keepScreen: true },
  bookshelf: { asset: 'wooden_bookshelf_worn', bottom: 0, cx: 0, cz: 0, scale: [1.02, 0.92, 0.69] },
  pendant: { asset: 'modern_ceiling_lamp_01', bottom: 0.221, cx: 0, cz: 0.002, scale: [0.8, 0.8, 0.8], lift: 2.09 },
  deskLamp: { asset: 'desk_lamp_arm_01', bottom: -0.088, cx: -0.018, cz: 0.01, scale: [0.5, 0.5, 0.5] },
  plantPot: { asset: 'potted_plant_02', bottom: 0, cx: -0.046, cz: -0.092, scale: [1, 1, 1] },
  diningTable: { asset: 'dining_table', bottom: -0.004, cx: -0.005, cz: 0.017, scale: [0.71, 0.89, 1.0], yaw: Q },
  chair: { asset: 'dining_chair_02', bottom: 0.001, cx: 0, cz: -0.043, scale: [1, 1, 1] },
  nightstand: { asset: 'side_table_01', bottom: -0.002, cx: 0, cz: 0, scale: [0.91, 1, 1.1] },
  desk: { asset: 'metal_office_desk', bottom: 0, cx: 0, cz: 0.004, scale: [0.85, 0.98, 0.95] },
  vase: { asset: 'ceramic_vase_01', bottom: 0.001, cx: 0, cz: 0, scale: [0.7, 0.7, 0.7] },
  wateringCan: { asset: 'watering_can_metal_01', bottom: -0.001, cx: 0, cz: 0.051, scale: [1, 1, 1] },
};
