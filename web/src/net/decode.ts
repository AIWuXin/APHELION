/**
 * Decoders from postcard bytes to the ts-rs generated protocol types.
 *
 * Field order here mirrors the Rust structs exactly. The golden fixture test
 * (`web/tests/postcard.test.ts`) decodes a Rust-produced byte blob and compares
 * it field by field, so an accidental reordering fails CI rather than producing
 * a subtly wrong HUD.
 */

import type { BeamView } from '../generated/BeamView';
import type { BootBlob } from '../generated/BootBlob';
import type { BuildingDef } from '../generated/BuildingDef';
import type { BuildingView } from '../generated/BuildingView';
import type { Catalog } from '../generated/Catalog';
import type { EffectView } from '../generated/EffectView';
import type { EventDef } from '../generated/EventDef';
import type { EventView } from '../generated/EventView';
import type { MapView } from '../generated/MapView';
import type { Orbital } from '../generated/Orbital';
import type { Policy } from '../generated/Policy';
import type { Resources } from '../generated/Resources';
import type { RouteDef } from '../generated/RouteDef';
import type { RouteView } from '../generated/RouteView';
import type { ShipView } from '../generated/ShipView';
import type { Snapshot } from '../generated/Snapshot';
import type { TechDef } from '../generated/TechDef';
import type { UnitDef } from '../generated/UnitDef';
import type { UnitView } from '../generated/UnitView';
import { Reader } from './postcard';

export function decodeResources(r: Reader): Resources {
  return {
    alloy: r.i32(),
    alloy_rate: r.i32(),
    fuel: r.i32(),
    fuel_rate: r.i32(),
    research: r.i32(),
    research_rate: r.i32(),
    energy_out: r.i32(),
    energy_in: r.i32(),
  };
}

export function decodeRouteView(r: Reader): RouteView {
  return {
    active: r.bool(),
    progress: r.u32(),
    throughput: r.u32(),
    loads: r.u32(),
    grade: r.u32(),
  };
}

export function decodeShipView(r: Reader): ShipView {
  return {
    id: r.u32(),
    kind: r.u8(),
    x: r.i32(),
    y: r.i32(),
    z: r.i32(),
    hp: r.i32(),
    hp_max: r.i32(),
    state: r.u8(),
    owner: r.u8(),
    target: r.u32(),
  };
}

export function decodeOrbital(r: Reader): Orbital {
  const capacity = r.u32();
  const used = r.u32();
  const routes = r.vec(r.len(), () => decodeRouteView(r));
  const wave = r.u32();
  const fleet_eta_ms = r.u32();
  const threat = r.u8();
  const ships = r.vec(r.len(), () => decodeShipView(r));
  return { capacity, used, routes, wave, fleet_eta_ms, threat, ships };
}

export function decodePolicy(r: Reader): Policy {
  return {
    sandbox_flags: r.u32(),
    ai_phase: r.u8(),
    ai_strength: r.u8(),
  };
}

export function decodeBuildingView(r: Reader): BuildingView {
  return {
    id: r.u32(),
    kind: r.u8(),
    tx: r.u32(),
    ty: r.u32(),
    hp: r.i32(),
    hp_max: r.i32(),
    state: r.u8(),
    progress: r.u32(),
    charge: r.u32(),
    flags: r.u8(),
    aux: r.u32(),
  };
}

export function decodeUnitView(r: Reader): UnitView {
  return {
    id: r.u32(),
    kind: r.u8(),
    x: r.i32(),
    y: r.i32(),
    z: r.i32(),
    hp: r.i32(),
    hp_max: r.i32(),
    state: r.u8(),
    facing: r.u8(),
    owner: r.u8(),
    target: r.u32(),
  };
}

export function decodeEffectView(r: Reader): EffectView {
  return {
    kind: r.u8(),
    x: r.i32(),
    y: r.i32(),
    z: r.i32(),
    age: r.u32(),
    life: r.u32(),
    value: r.i32(),
    owner: r.u8(),
  };
}

export function decodeBeamView(r: Reader): BeamView {
  return {
    kind: r.u8(),
    x0: r.i32(),
    y0: r.i32(),
    z0: r.i32(),
    x1: r.i32(),
    y1: r.i32(),
    z1: r.i32(),
    age: r.u32(),
    life: r.u32(),
    owner: r.u8(),
  };
}

export function decodeEventView(r: Reader): EventView {
  return {
    kind: r.u8(),
    a: r.u32(),
    b: r.u32(),
    tx: r.i32(),
    ty: r.i32(),
  };
}

export function decodeSnapshot(bytes: ArrayBufferView): Snapshot {
  const r = new Reader(bytes);
  const protocol = r.u32();
  const tick = r.u32();
  const hash = r.u32();
  const time_ms = r.u32();
  const status = r.u8();
  const speed = r.u8();
  const resources = decodeResources(r);
  const orbital = decodeOrbital(r);
  const policy = decodePolicy(r);
  const buildings = r.vec(r.len(), () => decodeBuildingView(r));
  const units = r.vec(r.len(), () => decodeUnitView(r));
  const effects = r.vec(r.len(), () => decodeEffectView(r));
  const beams = r.vec(r.len(), () => decodeBeamView(r));
  const events = r.vec(r.len(), () => decodeEventView(r));
  return {
    protocol,
    tick,
    hash,
    time_ms,
    status,
    speed,
    resources,
    orbital,
    policy,
    buildings,
    units,
    effects,
    beams,
    events,
  };
}

export function decodeBuildingDef(r: Reader): BuildingDef {
  return {
    key: r.str(),
    name_zh: r.str(),
    name_en: r.str(),
    desc: r.str(),
    cost_alloy: r.i32(),
    cost_fuel: r.i32(),
    energy: r.i32(),
    footprint: r.u8(),
    build_time_ms: r.u32(),
    category: r.u8(),
    hp: r.i32(),
    tech: r.u8(),
    range: r.u32(),
    capacity: r.i32(),
  };
}

export function decodeUnitDef(r: Reader): UnitDef {
  return {
    key: r.str(),
    name_zh: r.str(),
    name_en: r.str(),
    hp: r.i32(),
    speed: r.i32(),
    damage: r.i32(),
    range: r.u32(),
    cooldown_ms: r.u32(),
    layer: r.u8(),
  };
}

export function decodeRouteDef(r: Reader): RouteDef {
  return {
    key: r.str(),
    name_zh: r.str(),
    name_en: r.str(),
    capacity: r.u32(),
    period_ms: r.u32(),
    alloy: r.i32(),
    research: r.i32(),
    flavour: r.str(),
  };
}

export function decodeEventDef(r: Reader): EventDef {
  return {
    key: r.str(),
    text_zh: r.str(),
    speaker: r.str(),
    tone: r.u8(),
  };
}

export function decodeTechDef(r: Reader): TechDef {
  return {
    key: r.str(),
    name_zh: r.str(),
    name_en: r.str(),
    cost: r.i32(),
    effect_zh: r.str(),
    requires: r.u8(),
  };
}

export function decodeCatalog(r: Reader): Catalog {
  const protocol = r.u32();
  const buildings = r.vec(r.len(), () => decodeBuildingDef(r));
  const units = r.vec(r.len(), () => decodeUnitDef(r));
  const routes = r.vec(r.len(), () => decodeRouteDef(r));
  const events = r.vec(r.len(), () => decodeEventDef(r));
  const techs = r.vec(r.len(), () => decodeTechDef(r));
  return { protocol, buildings, units, routes, events, techs };
}

export function decodeMapView(r: Reader): MapView {
  const w = r.u32();
  const h = r.u32();
  // Each tile array is a postcard `Vec<T>`: varint count followed by the items.
  const materialCount = r.len();
  const material = new Array<number>(materialCount);
  for (let i = 0; i < materialCount; i += 1) material[i] = r.u8();
  const heightCount = r.len();
  const height = new Array<number>(heightCount);
  for (let i = 0; i < heightCount; i += 1) height[i] = r.i8();
  const decorCount = r.len();
  const decor = new Array<number>(decorCount);
  for (let i = 0; i < decorCount; i += 1) decor[i] = r.u8();
  const depositCount = r.len();
  const deposit = new Array<number>(depositCount);
  for (let i = 0; i < depositCount; i += 1) deposit[i] = r.u8();
  return { w, h, material, height, decor, deposit };
}

export function decodeBootBlob(bytes: ArrayBufferView): BootBlob {
  const r = new Reader(bytes);
  const protocol = r.u32();
  const seed = r.u32();
  const catalog = decodeCatalog(r);
  const map = decodeMapView(r);
  return { protocol, seed, catalog, map };
}
