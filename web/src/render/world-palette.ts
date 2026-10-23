/**
 * World palette: the material colours of the planet surface plus the hull
 * paints shared by every structure.
 *
 * Derived from the shared {@link PALETTE} tokens so the Canvas and the HUD share
 * the same four signal roles. Mineral surfaces stay restrained; ceramic facilities
 * and sparse engineering signals carry the strongest contrast.
 *
 * Companion materials form continuous 12/5-tile patches; natural seams are gone
 * and texture phases live in world space rather than restarting at tile edges.
 */

import { mix, PALETTE, SIGNAL, shade } from '../style/tokens';
import type { DecorKey, TerrainKey } from '../generated/content-keys';

/** A terrain material's full paint recipe. */
export interface MaterialPaint {
  /** Face colour of the tile. */
  readonly base: string;
  /** Lighter variant used for raised detail and crests. */
  readonly hi: string;
  /** Darker variant used for hollows and troughs. */
  readonly lo: string;
  /** Expansion-joint colour; only roads and poured aprons use it. */
  readonly seam: string;
  /** Fine 1px grain speckle. */
  readonly grain: string;
  /** Structural ink: cracks, joints, ripples, ridges. */
  readonly ink: string;
  /** Specular crest ink: water foam, sand highlight, crystal light. */
  readonly shine: string;
  /** Secondary material mixed in as small hard-edged patches, or `null`. */
  readonly companion: TerrainKey | null;
  /** Companion coverage, 0..1000. Higher = more of the companion. */
  readonly companionMix: number;
  /** How many 1px grain specks per tile. */
  readonly specks: number;
}

/** Terrain materials keyed by the generated content key. */
export const TERRAIN_PAINT: Readonly<Record<TerrainKey, MaterialPaint>> = {
  basalt: {
    base: '#454e50',
    hi: '#596366',
    lo: '#333d40',
    seam: '#2b3436',
    grain: '#717a78',
    ink: '#283235',
    shine: '#88948f',
    companion: 'regolith',
    companionMix: 240,
    specks: 2,
  },
  regolith: {
    base: '#7d715d',
    hi: '#94856e',
    lo: '#635947',
    seam: '#514a3c',
    grain: '#a79b83',
    ink: '#504737',
    shine: '#b6a98e',
    companion: 'basalt',
    companionMix: 190,
    specks: 3,
  },
  moss: {
    base: '#64705a',
    hi: '#78816b',
    lo: '#4c5746',
    seam: '#424e3b',
    grain: '#909981',
    ink: '#424c3a',
    shine: '#a7af93',
    companion: 'regolith',
    companionMix: 250,
    specks: 3,
  },
  sand: {
    base: '#9b8c6b',
    hi: '#b0a07e',
    lo: '#807153',
    seam: '#6c614a',
    grain: '#c3b593',
    ink: '#6c5e43',
    shine: '#d1c4a2',
    companion: 'regolith',
    companionMix: 230,
    specks: 2,
  },
  brine: {
    base: '#264852',
    hi: '#3e6269',
    lo: '#1a353f',
    seam: '#142c34',
    grain: '#628b8d',
    ink: '#152f38',
    shine: '#a2c6c7',
    companion: null,
    companionMix: 0,
    specks: 0,
  },
  apron: {
    base: '#656e6d',
    hi: '#88918c',
    lo: '#4d5857',
    seam: '#434c4c',
    grain: '#949d96',
    ink: '#374443',
    shine: '#b1b9ae',
    companion: null,
    companionMix: 0,
    specks: 2,
  },
  road: {
    base: '#353f3e',
    hi: '#45514d',
    lo: '#283230',
    seam: '#202a29',
    grain: '#65736a',
    ink: '#202a28',
    shine: '#9b9e84',
    companion: null,
    companionMix: 0,
    specks: 2,
  },
  crystal: {
    base: '#666d68',
    hi: '#858c83',
    lo: '#4b5552',
    seam: '#404946',
    grain: '#949b8e',
    ink: '#36403d',
    shine: '#bcc5b7',
    companion: null,
    companionMix: 0,
    specks: 1,
  },
  // -- the planet-scale biomes ------------------------------------------------
  // Both water rows are the same cold brine system as `brine`, pushed apart in
  // value instead of hue: deep is the darker of the two (the depth cue), but it
  // must still read as *water* -- the first near-black take got mistaken for
  // empty void at map scale, so the values sit clearly above black now.
  shallow: {
    base: '#365b63',
    hi: '#4e7980',
    lo: '#27464e',
    grain: '#7eaaab',
    seam: '#203d45',
    ink: '#203d45',
    shine: '#b2d3cf',
    companion: null,
    companionMix: 0,
    specks: 0,
  },
  deep: {
    base: '#203f49',
    hi: '#355a65',
    lo: '#142f39',
    grain: '#527e86',
    seam: '#142a32',
    ink: '#122d35',
    shine: '#81b4b8',
    companion: null,
    companionMix: 0,
    specks: 0,
  },
  snow: {
    base: '#acb6b4',
    hi: '#c3ccc6',
    lo: '#909d9b',
    seam: '#788987',
    grain: '#d5ddd5',
    ink: '#71817f',
    shine: '#e3e9df',
    companion: 'tundra',
    companionMix: 190,
    specks: 1,
  },
  tundra: {
    base: '#747c6e',
    hi: '#8a9280',
    lo: '#5c6559',
    seam: '#535d50',
    grain: '#a0a895',
    ink: '#4b5648',
    shine: '#b9c0ac',
    companion: 'moss',
    companionMix: 170,
    specks: 2,
  },
  desert: {
    base: '#a28b66',
    hi: '#b69d78',
    lo: '#866f50',
    seam: '#716046',
    grain: '#c9b48d',
    ink: '#705d42',
    shine: '#dcc7a0',
    companion: 'sand',
    companionMix: 220,
    specks: 2,
  },
  highland: {
    base: '#828c84',
    hi: '#9da69a',
    lo: '#626e66',
    seam: '#535f57',
    grain: '#b2b9aa',
    ink: '#47564c',
    shine: '#cad0bf',
    companion: 'basalt',
    companionMix: 200,
    specks: 3,
  },
  'mossy-tundra': {
    base: '#67725b',
    hi: '#7e896e',
    lo: '#505d47',
    seam: '#46533d',
    grain: '#99a18a',
    ink: '#424f39',
    shine: '#b3bca1',
    companion: 'tundra',
    companionMix: 200,
    specks: 3,
  },
};

/** Deposit (mineral vein) paints: amber flecks, never a glow. */
export const DEPOSIT = {
  /** Sparse exposed metal facet. */
  fleck: '#dfc18c',
  /** Copper-bearing vein. */
  warm: '#b49462',
  /** Dark mineral root. */
  dark: '#514c3e',
  wash: PALETTE.primary,
} as const;

/**
 * Coal seam paints: carbon black lumps under a cold, dusty sheen.
 *
 * The seam must never be mistaken for the ore vein at a glance, so it shares
 * nothing with {@link DEPOSIT}: no saturated ink, no glow, and the darks sit
 * below every terrain material's `lo` value.
 */
export const COAL = {
  /** Lump body: darker than any terrain face in the table. */
  lump: '#0d1112',
  /** Shadowed root under a lump. */
  root: '#050708',
  /** Cold mineral sheen on the lit facet. */
  sheen: '#5b6767',
  /** Loose dust scattered between the lumps. */
  dust: '#2a3132',
  /** Boiler / hopper paint for the T1 coal pair. */
  hull: '#313634',
  /** Feed chute and furnace recess on the thermal plant. */
  recess: '#1a1e1d',
} as const;

/** Light stone used for rocks, boulders and rubble. */
export const STONE = {
  light: '#a0a79d',
  mid: '#747f77',
  dark: '#424e49',
  ink: '#27332f',
} as const;

export const FLORA = {
  bark: '#464334',
  barkHi: '#68634b',
  leaf: '#58664a',
  leafHi: '#738063',
  leafTip: '#909b77',
  dry: '#918367',
} as const;

export const CRYSTAL_INK = {
  deep: '#424e4c',
  mid: '#8a958e',
  light: '#c0c9bc',
  tip: '#dde2d3',
} as const;

/** Colours for surface decoration, keyed by the generated content key. */
export const DECOR_PAINT: Readonly<Record<DecorKey, string>> = {
  none: 'transparent',
  rock: STONE.mid,
  crystal: CRYSTAL_INK.mid,
  tree: FLORA.leaf,
  pillar: '#4a5152',
  crater: '#1c2325',
  crate: '#7a6a48',
};

/** Bright signal inks used on the dark world, always within the four roles. */
export const GLOW = {
  /** Primary emphasis: reactor cores, pad lights, engine bells. */
  primary: SIGNAL.primary,
  /** Function: data links, dome interiors, solar glints. */
  function: SIGNAL.function,
  /** Status: hydroponics, lab, healthy machinery. */
  status: SIGNAL.status,
  /** Danger: hostile hulls, alarms. */
  danger: SIGNAL.danger,
} as const;

/** Hull colours shared by all player structures. */
export const HULL = {
  /** Light structural plate (roofs, tanks). */
  plate: '#8a9391',
  /** Mid plate, the default box colour. */
  mid: '#697270',
  /** Dark machinery. */
  dark: '#414a4a',
  /** Near-black recess. */
  recess: '#151a1c',
  /** Painted amber accent strips. */
  accent: '#b08a3a',
  /** Concrete pad. */
  pad: '#4c5153',
  /** Solar cell face. */
  cell: '#1b333d',
  /** Thin rib highlight on tanks. */
  rib: '#b7c0bd',
  /** Glass / window band. */
  glass: PALETTE.function,
} as const;

/** Hostile hull colours -- only ever used on enemy assets. */
export const ENEMY = {
  /** Enemy primary plate. */
  plate: '#6d3a33',
  /** Enemy mid plate. */
  mid: '#532b27',
  /** Enemy dark machinery. */
  dark: '#2e1816',
  /** Enemy emissive. */
  glow: PALETTE.danger,
} as const;

/** The dark rock lip a map island shows along its two visible sides. */
export const CRUST = {
  /** Top 1px lit lip. */
  rim: '#4b5355',
  /** Screen-left (lit) face. */
  left: '#2f3638',
  /** Screen-right (shadow) face. */
  right: '#1e2426',
  /** Bottom seam. */
  seam: '#0a0e0f',
} as const;

/** Blend a hull colour towards the sky tint, used for atmospheric depth. */
export function haze(color: string, amount: number): string {
  return mix(color, '#1b2a30', amount);
}

/** A darker variant helper so asset code avoids raw hex maths. */
export function darken(color: string, amount = 0.78): string {
  return shade(color, amount);
}
