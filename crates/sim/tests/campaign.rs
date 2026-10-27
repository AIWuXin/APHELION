//! Normal-command campaign playtests. No sandbox resources or direct era jumps.

mod common;

use oc_content::buildings as b;
use oc_protocol::{Command, STATUS_RUNNING};
use oc_sim::World;

fn anchor(world: &World, kind: u8) -> (i32, i32) {
    let (cx, cy) = world.map.start;
    let size = i32::from(World::def(kind).footprint);
    common::tiles(world)
        .into_iter()
        .filter(|&(tx, ty)| {
            let query = world.query_place(kind, tx, ty);
            query.placement_ok && query.unlocked
        })
        .min_by_key(|&(tx, ty)| {
            let distance = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy);
            let richness = if kind == b::B_COAL_MINE {
                world.map.footprint_coal(tx, ty, size)
            } else {
                0
            };
            (-richness, distance, ty, tx)
        })
        .unwrap_or_else(|| panic!("no legal anchor for building {kind}"))
}

fn place_at(world: &mut World, kind: u8, tx: i32, ty: i32) {
    place_at_inner(world, kind, tx, ty, true);
}

fn place_at_inner(world: &mut World, kind: u8, mut tx: i32, mut ty: i32, maintain: bool) {
    for _ in 0..30_000 {
        if maintain
            && kind != b::B_OIL_WELL
            && world.query_place(kind, tx, ty).reason == oc_protocol::REASON_OCCUPIED
        {
            (tx, ty) = anchor(world, kind);
        }
        if world.query_place(kind, tx, ty).ok {
            println!(
                "place kind={kind} tick={} alloy={} oil={} fuel={}",
                world.tick, world.res.alloy, world.res.oil, world.res.fuel
            );
            world.push(Command::Place {
                kind,
                tx: tx as u16,
                ty: ty as u16,
            });
            world.step();
            assert!(
                world.buildings.iter().any(|building| {
                    building.kind == kind && building.tx == tx && building.ty == ty
                }),
                "normal Place command must create the site"
            );
            return;
        }
        world.step();
        assert_eq!(
            world.status,
            STATUS_RUNNING,
            "campaign ended while saving for {kind}: tick={} wave={} alloy={} oil={} fuel={} buildings={} units={} kinds={:?}",
            world.tick,
            world.wave,
            world.res.alloy,
            world.res.oil,
            world.res.fuel,
            world.buildings.len(),
            world.units.len(),
            world.buildings.iter().map(|b| (b.kind, b.hp, b.state)).collect::<Vec<_>>(),
        );
    }
    panic!("timed out waiting to build {kind}");
}

fn place(world: &mut World, kind: u8) {
    let (tx, ty) = anchor(world, kind);
    place_at_inner(world, kind, tx, ty, true);
}

fn place_without_reinforce(world: &mut World, kind: u8) {
    let (tx, ty) = anchor(world, kind);
    place_at_inner(world, kind, tx, ty, false);
}

fn build_opening(world: &mut World) {
    place(world, b::B_COAL_MINE);
    place(world, b::B_COAL_PLANT);
    place(world, b::B_TURRET);
    place(world, b::B_TURRET);
}

#[test]
fn normal_t1_opening_survives_the_first_wave() {
    let mut world = World::new(common::SEED);
    assert_eq!(world.policy.sandbox_flags, 0);
    build_opening(&mut world);

    let mut resolved_tick = None;
    for _ in 0..6_500 {
        world.step();
        if world.wave >= 1 && !world.wave_in_flight {
            resolved_tick = Some(world.tick);
            break;
        }
        if world.status != STATUS_RUNNING {
            break;
        }
    }

    println!(
        "T1 baseline: tick={resolved_tick:?} time={}ms status={} alloy={} coal={} fuel={} energy={}/{} buildings={}",
        world.time_ms(),
        world.status,
        world.res.alloy,
        world.res.coal,
        world.res.fuel,
        world.energy_out,
        world.energy_in,
        world.buildings.len(),
    );
    assert_eq!(world.status, STATUS_RUNNING, "the colony must survive");
    assert!(resolved_tick.is_some(), "the first wave must resolve");
    assert_eq!(world.count_done(b::B_COAL_MINE), 1);
    assert_eq!(world.count_done(b::B_COAL_PLANT), 1);
    assert!(world.res.coal > 0, "the coal loop must bank a surplus");
}

fn reinforce(world: &mut World, skip: u8) {
    if !world.tick.is_multiple_of(120) || ensure_power(world, 0) {
        return;
    }
    if world.era >= 2 && skip != b::B_OIL_WELL && world.count_kind(b::B_OIL_WELL) == 0 {
        let (tx, ty) = world.map.oil_home;
        place_at_inner(world, b::B_OIL_WELL, tx, ty, false);
        return;
    }
    if world.era >= 2 && skip != b::B_FUEL && world.count_kind(b::B_FUEL) == 0 {
        place_without_reinforce(world, b::B_FUEL);
        return;
    }
    if world.era >= 3 && skip != b::B_PAD && world.count_kind(b::B_PAD) == 0 {
        place_without_reinforce(world, b::B_PAD);
        return;
    }
    let reserve = if world.era < 3 {
        0
    } else if world.count_kind(b::B_PAD) == 0 {
        World::def(b::B_PAD).cost_alloy + oc_content::balance::LAUNCH_ALLOY
    } else {
        oc_content::balance::LAUNCH_ALLOY
    };
    if skip != b::B_TURRET && world.count_kind(b::B_TURRET) < 6 && world.res.alloy >= reserve + 85 {
        if ensure_power(world, 8) {
            return;
        }
        place_without_reinforce(world, b::B_TURRET);
        return;
    }
    if skip != b::B_FLAK && world.count_kind(b::B_FLAK) < 2 && world.res.alloy >= reserve + 95 {
        if ensure_power(world, 9) {
            return;
        }
        place_without_reinforce(world, b::B_FLAK);
        return;
    }
    if skip != b::B_BULWARK && world.count_kind(b::B_BULWARK) < 3 && world.res.alloy >= reserve + 70
    {
        place_without_reinforce(world, b::B_BULWARK);
    }
}

fn ensure_power(world: &mut World, additional: i32) -> bool {
    if world.energy_out >= world.energy_in + additional {
        return false;
    }
    if world.buildings.iter().any(|b| {
        matches!(b.kind, b::B_COAL_PLANT | b::B_SOLAR) && b.state == oc_protocol::B_STATE_SITE
    }) {
        return true;
    }
    if world.res.alloy >= 110 && world.res.coal >= 10 {
        place_without_reinforce(world, b::B_COAL_PLANT);
    } else if world.res.alloy >= 60 {
        place_without_reinforce(world, b::B_SOLAR);
    }
    true
}

#[test]
fn normal_campaign_reaches_orbit() {
    let mut world = World::new(common::SEED);
    build_opening(&mut world);
    place(&mut world, b::B_TURRET);
    place(&mut world, b::B_REFINERY);
    place(&mut world, b::B_TURRET);
    let mut era2_tick = None;
    for _ in 0..6_500 {
        world.step();
        if world.era == 2 {
            era2_tick = Some(world.tick);
            break;
        }
        assert_eq!(world.status, STATUS_RUNNING);
    }
    assert!(
        era2_tick.is_some(),
        "coal and the first wave must unlock T2"
    );

    let (ox, oy) = world.map.oil_home;
    place_at(&mut world, b::B_OIL_WELL, ox, oy);
    place(&mut world, b::B_FUEL);
    for _ in 0..1_000 {
        if world.era == 3 {
            break;
        }
        world.step();
        assert_eq!(world.status, STATUS_RUNNING);
    }
    assert_eq!(
        world.era, 3,
        "oil and chemistry must unlock the launch tier"
    );
    let era3_tick = world.tick;
    place(&mut world, b::B_BULWARK);
    place(&mut world, b::B_BULWARK);
    place(&mut world, b::B_FLAK);
    place(&mut world, b::B_COAL_PLANT);
    place(&mut world, b::B_PAD);

    let mut orbit_tick = None;
    for _ in 0..30_000 {
        if world.orbital_capacity() > 0 {
            orbit_tick = Some(world.tick);
            break;
        }
        reinforce(&mut world, b::B_PAD);
        let pad = world.buildings.iter().find(|building| {
            building.kind == b::B_PAD
                && building.state == oc_protocol::B_STATE_IDLE
                && building.aux == 0
                && building.progress >= 1000
        });
        if let Some(pad) = pad {
            if world.res.fuel >= oc_content::balance::LAUNCH_FUEL
                && world.res.alloy >= oc_content::balance::LAUNCH_ALLOY
            {
                println!(
                    "launch command: tick={} fuel={} alloy={} oil={}",
                    world.tick, world.res.fuel, world.res.alloy, world.res.oil
                );
                world.push(Command::Launch { id: pad.id });
            }
        }
        world.step();
        assert_eq!(
            world.status,
            STATUS_RUNNING,
            "colony lost before orbit: tick={} wave={} alloy={} oil={} fuel={} buildings={}",
            world.tick,
            world.wave,
            world.res.alloy,
            world.res.oil,
            world.res.fuel,
            world.buildings.len(),
        );
    }

    println!(
        "campaign milestones: T2={era2_tick:?} T3={era3_tick} orbit={orbit_tick:?} oil={} fuel={} alloy={} units={}",
        world.res.oil,
        world.res.fuel,
        world.res.alloy,
        world.units.len(),
    );
    assert!(orbit_tick.is_some(), "petroleum must fuel a real rocket");
    assert_eq!(world.policy.sandbox_flags, 0);
    assert!(world
        .units
        .iter()
        .any(|unit| unit.kind == oc_content::units::U_FREIGHT_TRAIN));
}
