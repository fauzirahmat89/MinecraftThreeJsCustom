import { BlockID } from "../Block";
import { BLOCKS, RenderGeometry } from "../Block/blocks";

/** Blocks offered on the creative hotbar by default */
export const CREATIVE_PALETTE: BlockID[] = [
  BlockID.Grass,
  BlockID.Dirt,
  BlockID.Stone,
  BlockID.StoneBrick,
  BlockID.OakLog,
  BlockID.Leaves,
  BlockID.Sand,
  BlockID.Water,
  BlockID.Table,
];

/**
 * Every placeable block for the creative inventory, in id order. The Air block
 * (id 0) is left out: "placing" it would just erase a block.
 */
export const CREATIVE_BLOCKS: BlockID[] = BLOCKS.filter(
  (def) =>
    def !== undefined &&
    def.geometry !== RenderGeometry.None &&
    def.id !== BlockID.Air &&
    !def.paletteHidden
).map((def) => def.id);
