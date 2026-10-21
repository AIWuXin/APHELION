/**
 * Inline SVG line icons.
 *
 * Invariant #7: no bitmap, no emoji, no icon font. Every glyph is a 24×24
 * stroke-only path drawn with `currentColor`, so it inherits the HUD colour of
 * whatever plate / fill it sits on. Stroke weight and caps come from the
 * `.oc-hud svg` rule in `hud.css` (1.35px, round joins) so the icons stay one
 * family even as the palette changes.
 */

const wrap = (body: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

/* ------------------------------------------------------------------ modules */

/** Panel module: tactical scan. */
export const ICON_SCAN = wrap(
  '<path d="M4 20h16M8 20v-7"/><path d="M8 13l8-7 4 4-8 7z"/><path d="M18 4a7 7 0 0 1 2 5"/>',
);

/** Panel module: shipping lane / orbit path. */
export const ICON_ROUTE = wrap(
  '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 17C11 13 13 8 17 7"/>',
);

/** Panel module: research node tree. */
export const ICON_TECH = wrap(
  '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M12 11l-5 5M12 11l5 5"/>',
);

/** Panel module: event log. */
export const ICON_LOG = wrap('<path d="M4 6h16M4 12h10M4 18h13"/>');

/** Panel module: unit readout / target reticle. */
export const ICON_RETICLE = wrap(
  '<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1"/>',
);

/* ---------------------------------------------------------------- resources */

/** Resource: alloy ingot. */
export const ICON_ALLOY = wrap(
  '<path d="M6 9h12l3 5-3 5H6l-3-5z"/><path d="M6 9l-3 5h18"/>',
);

/** Resource: energy bolt. */
export const ICON_ENERGY = wrap('<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>');

/** Resource: fuel cell. */
export const ICON_FUEL = wrap(
  '<path d="M8 21V8h8v13z"/><path d="M8 12h8M11 8V4h2v4"/><path d="M12 15v3"/>',
);

/** Resource: coal lump with a seam facet. */
export const ICON_COAL = wrap(
  '<path d="M4 17l3-6 5-3 6 2 2 5-3 4H7z"/><path d="M9 11l2 3M14 12l-1 4"/>',
);

/** Resource: research flask. */
export const ICON_RESEARCH = wrap(
  '<path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M9 3h6M8 15h8"/>',
);

/* ----------------------------------------------------------------- actions */

/** Action: pause. */
export const ICON_PAUSE = wrap('<path d="M9 5v14M15 5v14"/>');

/** Action: play. */
export const ICON_PLAY = wrap('<path d="M8 5l11 7-11 7z"/>');

/** Action: launch a payload to orbit. */
export const ICON_LAUNCH = wrap(
  '<path d="M12 3c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z"/><path d="M8 14l-2 5 4-1M16 14l2 5-4-1"/>',
);

/** Action: demolish a structure. */
export const ICON_DEMOLISH = wrap(
  '<path d="M4 21h16M7 21V9l5-4 5 4v12"/><path d="M3 9l18-4M10 14l4 4M14 14l-4 4"/>',
);

/** Sandbox: infinite stockpile. */
export const ICON_INFINITE = wrap(
  '<path d="M6 12a3 3 0 1 0 3-3c-2 0-3 1.5-3 3s1 3 3 3c3 0 4-6 7-6a3 3 0 1 1-3 3c2 0 3-1.5 3-3s-1-3-3-3c-3 0-4 6-7 6z"/>',
);

/** Sandbox: instant construction. */
export const ICON_BOLT = wrap('<path d="M13 2L6 13h5l-1 9 7-11h-5z"/>');

/** Generic structure silhouette. */
export const ICON_STRUCTURE = wrap(
  '<path d="M4 20h16M6 20V9h12v11"/><path d="M10 20v-6h4v6M9 9V6h6v3"/>',
);

/** Generic craft silhouette. */
export const ICON_CRAFT = wrap('<path d="M12 4l6 14-6-4-6 4z"/>');

/** Speaker / signal glyph for the subtitle tag. */
export const ICON_SIGNAL = wrap('<path d="M4 12h3l4-7 4 14 3-7h2"/>');

/* ---------------------------------------------------------------- buildings */
/* Order matches BUILDING_KEYS / `BuildingDef::kind`. */

/** Command hub: core tower with mast. */
export const ICON_B_HUB = wrap(
  '<path d="M4 20h16M6 20V12l6-4 6 4v8"/><path d="M10 20v-5h4v5"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/>',
);

/** Solar array: tilted panel on legs. */
export const ICON_B_SOLAR = wrap(
  '<path d="M4 20h16"/><path d="M7 15h11l2-7H9z"/><path d="M11 8v7M15 8v7"/><path d="M9 15l-2 5M18 15l2 5"/>',
);

/** Refinery: process tank on a feed pipe. */
export const ICON_B_REFINERY = wrap(
  '<path d="M4 20h16"/><path d="M7 20V10a5 5 0 0 1 10 0v10"/><path d="M7 14h10"/><path d="M17 16h4v4"/><path d="M12 5V3"/>',
);

/** Fuel synth: pressurised tank with a fuel drop. */
export const ICON_B_FUEL = wrap(
  '<path d="M7 20V8l5-4 5 4v12"/><path d="M7 12h10"/><path d="M12 15c1.3 1.1 1.8 1.8 1.8 2.6a1.8 1.8 0 1 1-3.6 0c0-.8.5-1.5 1.8-2.6z"/>',
);

/** Research lab: dome observatory. */
export const ICON_B_LAB = wrap(
  '<path d="M4 20h16"/><path d="M6 20v-6a6 6 0 0 1 12 0v6"/><circle cx="12" cy="14" r="2"/><path d="M12 8V5M10 5h4"/>',
);

/** Launch pad: rocket on a pad. */
export const ICON_B_PAD = wrap(
  '<path d="M3 20h18M5 20v-2h14v2"/><path d="M12 3c2 2 3 5 3 8l-3 2-3-2c0-3 1-6 3-8z"/><path d="M9 13l-2 4M15 13l2 4"/>',
);

/** Freight dock: gantry over a container. */
export const ICON_B_DOCK = wrap(
  '<path d="M3 20h18"/><path d="M5 20v-7h8v7M5 16h8"/><path d="M17 20V7h3M20 7l-3 2"/>',
);

/** Relay mast: guyed antenna. */
export const ICON_B_RELAY = wrap(
  '<path d="M12 20V8M8 20h8"/><path d="M12 8L6 5M12 8l6-3"/><circle cx="12" cy="8" r="1.5"/><path d="M7 3a8 8 0 0 1 10 0"/>',
);

/** Rail turret: fixed mount and long barrel. */
export const ICON_B_TURRET = wrap(
  '<path d="M3 20h18M6 20v-4h8v4"/><path d="M10 16V10h3v6"/><path d="M13 12l7-2M13 10l7-2"/>',
);

/** Flak battery: angled barrels with a sighting arc. */
export const ICON_B_FLAK = wrap(
  '<path d="M3 20h18M6 20v-4h8v4"/><path d="M9 16V8M12 16V9M15 16v-5"/><path d="M16 7a5 5 0 0 1 4 1"/>',
);

/** Bulwark: stacked wall blocks. */
export const ICON_B_BULWARK = wrap(
  '<path d="M3 20h18"/><path d="M5 20V11h4v9M9 20V8h6v12M15 20V11h4v9"/>',
);

/** Hangar: arch with a parked craft. */
export const ICON_B_HANGAR = wrap(
  '<path d="M3 20h18"/><path d="M5 20v-8a7 7 0 0 1 14 0v8"/><path d="M8 20v-6h8v6"/><path d="M12 10v4"/>',
);

/** Radar array: dish with ranging arcs. */
export const ICON_B_RADAR = wrap(
  '<path d="M4 20h16M9 20v-5"/><path d="M9 15l7-5 3 4-7 5z"/><path d="M17 4a7 7 0 0 1 3 5"/>',
);

/** Repair bay: gantry with a repair cross. */
export const ICON_B_REPAIR = wrap(
  '<path d="M3 20h18"/><path d="M5 20v-8h14v8"/><path d="M5 12V9h14v3"/><path d="M12 13v4M10 15h4"/>',
);

/** Coal extractor: bucket wheel biting into a seam, conveyor to a hopper. */
export const ICON_B_COAL_MINE = wrap(
  '<path d="M3 20h18"/><circle cx="8" cy="15" r="4"/><path d="M8 10.5v1M8 18.5v1M3.5 15h1M12.5 15h1"/><path d="M11 13l6-3 2 2-6 3z"/><path d="M17 10V7h3v3z"/><path d="M5 20l1-3M11 20l-1-3"/>',
);

/** Thermal plant: boiler drum under a tall stack with a smoke curl. */
export const ICON_B_COAL_PLANT = wrap(
  '<path d="M3 20h18"/><path d="M5 20v-6a4 4 0 0 1 8 0v6"/><path d="M5 16h8"/><path d="M16 20V7h3v13"/><path d="M16 11h3M16 15h3"/><path d="M17 4c1 1 0 2 1 3"/>',
);

/* -------------------------------------------------------------------- units */
/* Order matches UNIT_KEYS / `UnitDef::kind`. */

/** Raider: light ground craft. */
export const ICON_U_RAIDER = wrap(
  '<path d="M12 6l5 10-5-2-5 2z"/><path d="M12 14v4"/><path d="M8 20h8"/>',
);

/** Siege walker: armoured biped. */
export const ICON_U_SIEGE = wrap(
  '<path d="M8 15h8l2-6H6z"/><path d="M10 9V7h4v2"/><path d="M6 20l2-5M18 20l-2-5"/><path d="M3 15h3M18 15h3"/>',
);

/** Dropship: descending pod. */
export const ICON_U_DROPSHIP = wrap(
  '<path d="M12 4l5 8-5 3-5-3z"/><path d="M7 12l-3 4M17 12l3 4"/><path d="M12 15v5M9 20h6"/>',
);

/** Interceptor: swept delta. */
export const ICON_U_INTERCEPTOR = wrap(
  '<path d="M12 5l3 7 6 3-9 1-9-1 6-3z"/><path d="M12 5v6"/>',
);

/** Hauler: cargo lander. */
export const ICON_U_HAULER = wrap(
  '<path d="M4 15V9h8l3 3v3"/><path d="M15 12h4v3"/><circle cx="8" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/><path d="M4 20h14"/>',
);

/** Warship: orbital hull with fins. */
export const ICON_U_WARSHIP = wrap(
  '<path d="M3 13h11l6-3 1 2-5 4H5z"/><path d="M15 10v6"/><path d="M6 13l-2 3M9 13l-2 3"/>',
);

/** Survey drone: quad rotor probe. */
export const ICON_U_DRONE = wrap(
  '<circle cx="12" cy="12" r="4"/><path d="M7 7L4 4M17 7l3-3M7 17l-3 3M17 17l3 3"/><circle cx="12" cy="12" r="1"/>',
);

/* --------------------------------------------------------------------- maps */

/** Category icon per `CATEGORY_KEYS` index. */
export const CATEGORY_ICONS: readonly string[] = [
  ICON_STRUCTURE,
  ICON_ROUTE,
  ICON_LAUNCH,
  ICON_B_REPAIR,
];

/** Building art per `BUILDING_KEYS` index (command-hub first). */
export const BUILDING_ICONS: readonly string[] = [
  ICON_B_HUB,
  ICON_B_SOLAR,
  ICON_B_REFINERY,
  ICON_B_FUEL,
  ICON_B_LAB,
  ICON_B_PAD,
  ICON_B_DOCK,
  ICON_B_RELAY,
  ICON_B_TURRET,
  ICON_B_FLAK,
  ICON_B_BULWARK,
  ICON_B_HANGAR,
  ICON_B_RADAR,
  ICON_B_REPAIR,
  ICON_B_COAL_MINE,
  ICON_B_COAL_PLANT,
];

/** Craft art per `UNIT_KEYS` index. */
export const UNIT_ICONS: readonly string[] = [
  ICON_U_RAIDER,
  ICON_U_SIEGE,
  ICON_U_DROPSHIP,
  ICON_U_INTERCEPTOR,
  ICON_U_HAULER,
  ICON_U_WARSHIP,
  ICON_U_DRONE,
];
