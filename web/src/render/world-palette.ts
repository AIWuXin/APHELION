/**
 * World palette: the material colours of the planet surface plus the hull
 * paints shared by every structure.
 *
 * Derived from the shared {@link PALETTE} tokens so the Canvas and the HUD can
 * never disagree about what "amber" means. Everything here is low saturation
 * and dark-biased: the only saturated pixels in the frame are energy (amber),
 * data (cyan), growth/health (green) and hostiles (red).
 *
 * A material is more than a hue: each row also names an interleaved *companion*
 * material (so big generated regions break up into 1-4 tile hard-edged patches)
 * and the extra inks its texture needs.
 */

import { mix, PALETTE, shade } from '../style/tokens';
import type { DecorKey, TerrainKey } from '../generated/content-keys';

/** A terrain material's full paint recipe. */
export interface MaterialPaint {
  /** Face colour of the tile. */
  readonly base: string;
  /** Lighter variant used for raised detail and crests. */
  readonly hi: string;
  /** Darker variant used for hollows and troughs. */
  readonly lo: string;
  /** 1px seam colour on the two lower tile edges. */
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
    base: '#343b3e',
    hi: '#424a4e',
    lo: '#232a2d',
    seam: '#101619',
    grain: '#525a5e',
    ink: '#151b1e',
    shine: '#616b6f',
    companion: 'regolith',
    companionMix: 240,
    specks: 6,
  },
  regolith: {
    base: '#665c48',
    hi: '#796d55',
    lo: '#514736',
    seam: '#292316',
    grain: '#8c8064',
    ink: '#3a3225',
    shine: '#a09277',
    companion: 'basalt',
    companionMix: 190,
    specks: 9,
  },
  moss: {
    base: '#5a6b3c',
    hi: '#74884a',
    lo: '#414f2c',
    seam: '#232d17',
    grain: '#9cb064',
    ink: '#37441f',
    shine: '#bccb7e',
    companion: 'regolith',
    companionMix: 250,
    specks: 10,
  },
  sand: {
    base: '#877c58',
    hi: '#9b8f68',
    lo: '#6c6145',
    seam: '#3c3523',
    grain: '#b5a67a',
    ink: '#554c31',
    shine: '#cdbd90',
    companion: 'regolith',
    companionMix: 230,
    specks: 5,
  },
  brine: {
    base: '#14343e',
    hi: '#1e4c5a',
    lo: '#0b2129',
    seam: '#051216',
    grain: '#3b7f8f',
    ink: '#081a20',
    shine: '#86d4de',
    companion: null,
    companionMix: 0,
    specks: 2,
  },
  apron: {
    base: '#4a5052',
    hi: '#5b6264',
    lo: '#363c3e',
    seam: '#1c2224',
    grain: '#6d7578',
    ink: '#262c2f',
    shine: '#7d8688',
    companion: null,
    companionMix: 0,
    specks: 4,
  },
  road: {
    base: '#262b2d',
    hi: '#333a3c',
    lo: '#1a1e20',
    seam: '#0b0f10',
    grain: '#495154',
    ink: '#0f1416',
    shine: '#7a7563',
    companion: null,
    companionMix: 0,
    specks: 5,
  },
  crystal: {
    base: '#4a3d62',
    hi: '#63527f',
    lo: '#352b47',
    seam: '#1c1728',
    grain: '#9c86c8',
    ink: '#2a2138',
    shine: '#c0aae4',
    companion: null,
    companionMix: 0,
    specks: 5,
  },
};

/** Deposit (mineral vein) paints: amber flecks, never a glow. */
export const DEPOSIT = {
  /** Bright fleck. */
  fleck: '#e8c368',
  /** Mid fleck. */
  warm: '#c39a41',
  /** Dark root of a vein. */
  dark: '#7a622b',
  /** Ground wash -- always below 10% alpha. */
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
  light: '#8b9290',
  mid: '#6b7271',
  dark: '#464d4c',
  ink: '#232928',
} as const;

/** Tree paints: bark, two canopy tones and a sunlit tip. */
export const FLORA = {
  bark: '#3d3323',
  barkHi: '#5a4b33',
  leaf: '#4f6b35',
  leafHi: '#688a42',
  leafTip: '#8cab56',
  dry: '#8a7b3f',
} as const;

/** Hostile crystal field ink (muted violet, never a fourth accent hue). */
export const CRYSTAL_INK = {
  deep: '#3b2f52',
  mid: '#6b5a92',
  light: '#9d88c9',
  tip: '#c7b6e8',
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

/** Accent glows used by buildings, always one of the three allowed roles. */
export const GLOW = {
  /** Primary emphasis: reactor cores, pad lights, engine bells. */
  primary: PALETTE.primary,
  /** Function: data links, dome interiors, solar glints. */
  function: PALETTE.function,
  /** Status: hydroponics, lab, healthy machinery. */
  status: PALETTE.status,
  /** Danger: hostile hulls, alarms. */
  danger: PALETTE.danger,
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
