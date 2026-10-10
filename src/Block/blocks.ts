import { BlockID, FLUID_FALLING, FLUID_MAX_LEVEL } from ".";

/**
 * Texture layers of the block texture array. The index of a name in this list
 * is the layer index sampled by the chunk shader.
 */
export const TEXTURE_LAYERS = [
  "grass_side",
  "grass",
  "dirt",
  "stone",
  "coal_ore",
  "iron_ore",
  "bedrock",
  "oak_log_side",
  "oak_log_top",
  "leaves",
  "tall_grass",
  "flower_rose",
  "flower_dandelion",
  "redstone_lamp",
  "stonebrick",
  "sand",
  "snow",
  "water",
  "lava",
  "sandstone_top",
  "sandstone_side",
  "gravel",
  "snow_grass_side",
  "spruce_log_side",
  "spruce_log_top",
  "spruce_leaves",
  "birch_log_side",
  "birch_log_top",
  "birch_leaves",
  "cactus_side",
  "cactus_top",
  "dead_bush",
  "gold_ore",
  "diamond_ore",
  "oak_planks",
] as const;

export type TextureName = typeof TEXTURE_LAYERS[number];

export const textureLayer = (name: TextureName): number =>
  TEXTURE_LAYERS.indexOf(name);

export enum RenderGeometry {
  None,
  Cube,
  Cross,
  /** Liquid with per-corner surface heights derived from neighbouring levels */
  Fluid,
  /** Axis-aligned box smaller than the cell (snow layer, cactus) */
  Box,
  /**
   * Furniture model (table): a tabletop plus corner legs, merged with
   * neighbouring blocks of the same type (fence-style connection).
   */
  Table,
}

/** Block-space AABB: minX, minY, minZ, maxX, maxY, maxZ */
export type BlockBox = [number, number, number, number, number, number];

export const FULL_BOX: BlockBox = [0, 0, 0, 1, 1, 1];

export const SNOW_LAYER_HEIGHT = 2 / 16;

/** Table model metrics (in block units) */
export const TABLE_TOP_Y = 13 / 16;
export const TABLE_INSET = 2 / 16;
export const TABLE_LEG = 3 / 16;

/** Which horizontal neighbours are the same table block */
export type TableConnections = {
  west: boolean;
  east: boolean;
  north: boolean;
  south: boolean;
};

/**
 * Render boxes of a table given its connections. A side that connects extends
 * the tabletop to the cell edge and suppresses the legs on that corner, so a
 * lone table is a small 4-legged table and a run of them forms one long
 * tabletop with legs only under the outer corners.
 */
export function tableParts(c: TableConnections): BlockBox[] {
  const x0 = c.west ? 0 : TABLE_INSET;
  const x1 = c.east ? 1 : 1 - TABLE_INSET;
  const z0 = c.north ? 0 : TABLE_INSET;
  const z1 = c.south ? 1 : 1 - TABLE_INSET;
  const parts: BlockBox[] = [[x0, TABLE_TOP_Y, z0, x1, 1, z1]];
  const legX = (west: boolean): [number, number] =>
    west
      ? [TABLE_INSET, TABLE_INSET + TABLE_LEG]
      : [1 - TABLE_INSET - TABLE_LEG, 1 - TABLE_INSET];
  const legZ = (north: boolean): [number, number] =>
    north
      ? [TABLE_INSET, TABLE_INSET + TABLE_LEG]
      : [1 - TABLE_INSET - TABLE_LEG, 1 - TABLE_INSET];
  for (const west of [true, false]) {
    for (const north of [true, false]) {
      if (c[west ? "west" : "east"] || c[north ? "north" : "south"]) continue;
      const [lx0, lx1] = legX(west);
      const [lz0, lz1] = legZ(north);
      parts.push([lx0, 0, lz0, lx1, TABLE_TOP_Y, lz1]);
    }
  }
  return parts;
}

export enum RenderLayer {
  Opaque,
  Cutout,
  Translucent,
}

export type SoundGroup =
  | "grass"
  | "wood"
  | "stone"
  | "sand"
  | "snow"
  | "gravel"
  | "cloth"
  | "glass";

export type BlockDef = {
  id: BlockID;
  name: string;
  geometry: RenderGeometry;
  layer: RenderLayer;
  /** Fully occludes neighbouring faces */
  opaque: boolean;
  /** Player and physics can pass through */
  passable: boolean;
  /** Placing a block into this cell replaces it (vanilla `canBeReplaced`) */
  replaceable: boolean;
  /** Collision and render bounds for Cube/Box geometry */
  box: BlockBox;
  /** Liquid: slows and buoys the player, tints the view when submerged */
  fluid: boolean;
  /** Source block id of this liquid (Water/Lava); same for every level */
  fluidSource: BlockID;
  /** 0 for a source, 1-7 for flowing liquid (higher = shallower) */
  fluidLevel: number;
  /** Flowing liquid fed from the block above; renders as a full column */
  fluidFalling: boolean;
  /** Rendered at full brightness regardless of lighting */
  emissive: boolean;
  /** Block light emitted (0-15) */
  lightEmission: number;
  /** Light lost when passing through this block (0 = clear, 15 = opaque) */
  lightOpacity: number;
  /** Skip faces between two blocks of this same type (e.g. glass, water) */
  cullSelf: boolean;
  /** Texture layer per face: +X, -X, +Y, -Y, +Z, -Z */
  faces: [number, number, number, number, number, number];
  /** Toolbar icon data URL, rendered from the block textures at load */
  uiTexture: string;
  sound: SoundGroup;
};

type FaceSpec =
  | TextureName
  | { side: TextureName; top: TextureName; bottom?: TextureName };

const faces = (
  spec: FaceSpec
): [number, number, number, number, number, number] => {
  if (typeof spec === "string") {
    const l = textureLayer(spec);
    return [l, l, l, l, l, l];
  }
  const side = textureLayer(spec.side);
  const top = textureLayer(spec.top);
  const bottom = textureLayer(spec.bottom ?? spec.top);
  return [side, side, top, bottom, side, side];
};

const cube = (
  id: BlockID,
  name: string,
  spec: FaceSpec,
  uiTexture: string,
  sound: SoundGroup,
  overrides: Partial<BlockDef> = {}
): BlockDef => ({
  id,
  name,
  geometry: RenderGeometry.Cube,
  layer: RenderLayer.Opaque,
  opaque: true,
  passable: false,
  replaceable: false,
  box: FULL_BOX,
  fluid: false,
  fluidSource: id,
  fluidLevel: 0,
  fluidFalling: false,
  emissive: false,
  lightEmission: 0,
  lightOpacity: 15,
  cullSelf: true,
  faces: faces(spec),
  uiTexture,
  sound,
  ...overrides,
});

/** A solid block occupying only part of its cell, rendered with alpha cutout */
const box = (
  id: BlockID,
  name: string,
  spec: FaceSpec,
  bounds: BlockBox,
  sound: SoundGroup,
  overrides: Partial<BlockDef> = {}
): BlockDef =>
  cube(id, name, spec, "", sound, {
    geometry: RenderGeometry.Box,
    layer: RenderLayer.Cutout,
    opaque: false,
    box: bounds,
    lightOpacity: 0,
    cullSelf: false,
    ...overrides,
  });

/**
 * Furniture table: a multi-box model (tabletop + legs) that connects to
 * neighbouring tables of the same type. Collision, raycast and the selection
 * outline use the cell-filling tabletop slab, so the player can stand on it.
 */
const table = (id: BlockID, name: string): BlockDef =>
  cube(id, name, "oak_planks", "", "wood", {
    geometry: RenderGeometry.Table,
    layer: RenderLayer.Cutout,
    opaque: false,
    passable: false,
    replaceable: false,
    box: [0, TABLE_TOP_Y, 0, 1, 1, 1],
    lightOpacity: 1,
    cullSelf: true,
  });

const leaves = (
  id: BlockID,
  name: string,
  texture: TextureName,
  uiTexture: string
): BlockDef =>
  cube(id, name, texture, uiTexture, "grass", {
    layer: RenderLayer.Cutout,
    opaque: false,
    lightOpacity: 1,
    cullSelf: false,
  });

const fluid = (
  id: BlockID,
  name: string,
  texture: TextureName,
  uiTexture: string,
  overrides: Partial<BlockDef> = {}
): BlockDef =>
  cube(id, name, texture, uiTexture, "stone", {
    geometry: RenderGeometry.Fluid,
    layer: RenderLayer.Translucent,
    opaque: false,
    passable: true,
    replaceable: true,
    fluid: true,
    lightOpacity: 2,
    cullSelf: true,
    ...overrides,
  });

/** The 15 flowing variants (levels 1-7, optionally falling) of a source liquid */
const flowingVariants = (source: BlockDef, base: BlockID): BlockDef[] => {
  const out: BlockDef[] = [];
  for (let falling = 0; falling <= 1; falling++) {
    for (let level = 1; level <= FLUID_MAX_LEVEL; level++) {
      out.push({
        ...source,
        id: base + (level - 1) + (falling ? FLUID_FALLING : 0),
        name: `flowing_${source.name}`,
        fluidSource: source.id,
        fluidLevel: level,
        fluidFalling: falling === 1,
        uiTexture: "",
      });
    }
  }
  return out;
};

/** Outline shapes from vanilla `TallGrassBlock` / `FlowerBlock` (in 16ths) */
const BUSH_BOX: BlockBox = [2 / 16, 0, 2 / 16, 14 / 16, 13 / 16, 14 / 16];
const FLOWER_BOX: BlockBox = [5 / 16, 0, 5 / 16, 11 / 16, 10 / 16, 11 / 16];

const cross = (
  id: BlockID,
  name: string,
  texture: TextureName,
  uiTexture: string,
  bounds: BlockBox = BUSH_BOX
): BlockDef => ({
  id,
  name,
  geometry: RenderGeometry.Cross,
  layer: RenderLayer.Cutout,
  opaque: false,
  passable: true,
  replaceable: true,
  box: bounds,
  fluid: false,
  fluidSource: id,
  fluidLevel: 0,
  fluidFalling: false,
  emissive: false,
  lightEmission: 0,
  lightOpacity: 0,
  cullSelf: false,
  faces: faces(texture),
  uiTexture,
  sound: "grass",
});

const defs: BlockDef[] = [
  {
    id: BlockID.Air,
    name: "air",
    geometry: RenderGeometry.None,
    layer: RenderLayer.Opaque,
    opaque: false,
    passable: true,
    replaceable: true,
    box: FULL_BOX,
    fluid: false,
    fluidSource: BlockID.Air,
    fluidLevel: 0,
    fluidFalling: false,
    emissive: false,
    lightEmission: 0,
    lightOpacity: 0,
    cullSelf: true,
    faces: [0, 0, 0, 0, 0, 0],
    uiTexture: "",
    sound: "stone",
  },
  cube(
    BlockID.Grass,
    "grass",
    { side: "grass_side", top: "grass", bottom: "dirt" },
    "",
    "grass"
  ),
  cube(BlockID.Dirt, "dirt", "dirt", "", "gravel"),
  cube(BlockID.Stone, "stone", "stone", "", "stone"),
  cube(BlockID.CoalOre, "coal_ore", "coal_ore", "", "stone"),
  cube(BlockID.IronOre, "iron_ore", "iron_ore", "", "stone"),
  cube(BlockID.Bedrock, "bedrock", "bedrock", "", "stone"),
  cube(
    BlockID.OakLog,
    "oak_log",
    { side: "oak_log_side", top: "oak_log_top" },
    "",
    "wood"
  ),
  leaves(BlockID.Leaves, "leaves", "leaves", ""),
  cross(BlockID.TallGrass, "tall_grass", "tall_grass", ""),
  cross(BlockID.FlowerRose, "flower_rose", "flower_rose", "", FLOWER_BOX),
  cross(
    BlockID.FlowerDandelion,
    "flower_dandelion",
    "flower_dandelion",
    "",
    FLOWER_BOX
  ),
  cube(BlockID.RedstoneLamp, "redstone_lamp", "redstone_lamp", "", "glass", {
    emissive: true,
    lightEmission: 15,
  }),
  cube(BlockID.StoneBrick, "stone_brick", "stonebrick", "", "stone"),
  fluid(BlockID.Water, "water", "water", ""),
  fluid(BlockID.Lava, "lava", "lava", "", {
    emissive: true,
    lightEmission: 15,
    lightOpacity: 15,
  }),
  cube(BlockID.Sand, "sand", "sand", "", "sand"),
  cube(
    BlockID.Sandstone,
    "sandstone",
    { side: "sandstone_side", top: "sandstone_top" },
    "",
    "stone"
  ),
  cube(BlockID.Gravel, "gravel", "gravel", "", "gravel"),
  cube(
    BlockID.SnowGrass,
    "snow_grass",
    { side: "snow_grass_side", top: "snow", bottom: "dirt" },
    "",
    "grass"
  ),
  cube(BlockID.Snow, "snow", "snow", "", "snow"),
  cube(
    BlockID.SpruceLog,
    "spruce_log",
    { side: "spruce_log_side", top: "spruce_log_top" },
    "",
    "wood"
  ),
  leaves(BlockID.SpruceLeaves, "spruce_leaves", "spruce_leaves", ""),
  cube(
    BlockID.BirchLog,
    "birch_log",
    { side: "birch_log_side", top: "birch_log_top" },
    "",
    "wood"
  ),
  leaves(BlockID.BirchLeaves, "birch_leaves", "birch_leaves", ""),
  box(
    BlockID.Cactus,
    "cactus",
    { side: "cactus_side", top: "cactus_top" },
    [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16],
    "cloth",
    { cullSelf: true }
  ),
  box(
    BlockID.SnowLayer,
    "snow_layer",
    "snow",
    [0, 0, 0, 1, SNOW_LAYER_HEIGHT, 1],
    "snow",
    { replaceable: true }
  ),
  cross(BlockID.DeadBush, "dead_bush", "dead_bush", ""),
  cube(BlockID.GoldOre, "gold_ore", "gold_ore", "", "stone"),
  cube(BlockID.DiamondOre, "diamond_ore", "diamond_ore", "", "stone"),
  table(BlockID.Table, "table"),
];

export const BLOCKS: BlockDef[] = [];
for (const def of defs) {
  BLOCKS[def.id] = def;
}
for (const def of [
  ...flowingVariants(BLOCKS[BlockID.Water], BlockID.FlowingWater),
  ...flowingVariants(BLOCKS[BlockID.Lava], BlockID.FlowingLava),
]) {
  BLOCKS[def.id] = def;
}

export const getBlockDef = (id: BlockID): BlockDef => BLOCKS[id] ?? BLOCKS[0];

/** Block id for `source` liquid at `level` (0 = source), optionally falling */
export const fluidBlockId = (
  source: BlockID,
  level: number,
  falling = false
): BlockID => {
  if (level <= 0 && !falling) return source;
  const base =
    source === BlockID.Lava ? BlockID.FlowingLava : BlockID.FlowingWater;
  const l = Math.min(Math.max(level, 1), FLUID_MAX_LEVEL);
  return base + (l - 1) + (falling ? FLUID_FALLING : 0);
};

/**
 * Height of a liquid's surface within its block, following Minecraft:
 * sources and every flowing level fill 8/9 down to 1/9 of the block.
 */
export const fluidHeight = (def: BlockDef): number =>
  def.fluidFalling ? 8 / 9 : 1 - (def.fluidLevel + 1) / 9;
