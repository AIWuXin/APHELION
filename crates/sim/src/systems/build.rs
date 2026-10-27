//! Construction: build sites tick up, then become solid structures.
//!
//! The build stage also owns the two support-system passes: repair-bay healing
//! and hangar interceptor production. They live here (not in Combat) so the
//! order stays "economy -> build -> launch -> logistics -> combat -> director -> era".

use oc_content::buildings;
use oc_protocol::{B_STATE_IDLE, B_STATE_SITE, EVENT_BUILD_DONE};

use crate::systems::{hangar, repair};
use crate::world::{World, SANDBOX_INSTANT};

/// Advance every build site, then the support systems.
pub fn update(world: &mut World, dt_ms: u32) {
    let instant = world.sandbox(SANDBOX_INSTANT) && oc_content::balance::SANDBOX_INSTANT_BUILD;
    let mut finished: Vec<(usize, u8, i32, i32)> = Vec::new();
    for (i, b) in world.buildings.iter_mut().enumerate() {
        if b.state != B_STATE_SITE {
            continue;
        }
        let def = World::def(b.kind);
        let step = if instant || def.build_ms == 0 {
            1000
        } else {
            (dt_ms * 1000 / def.build_ms.max(1)).max(1)
        };
        b.progress = (b.progress + step as u16).min(1000);
        // Sites grow in hit points as they rise.
        let target = def.hp * i32::from(b.progress) / 1000;
        if target > b.hp {
            b.hp = target;
        }
        if b.progress >= 1000 {
            finished.push((i, b.kind, b.tx, b.ty));
        }
    }
    for (i, kind, tx, ty) in finished {
        let def = World::def(kind);
        let b = &mut world.buildings[i];
        b.state = B_STATE_IDLE;
        b.hp = def.hp;
        b.progress = 1000;
        world.event(EVENT_BUILD_DONE, u32::from(kind), 0, tx as i16, ty as i16);
        world.effect(
            oc_protocol::EFFECT_SPARK,
            oc_iso::torus::wrap_fp_x(tx * oc_iso::FP + oc_iso::FP),
            oc_iso::torus::wrap_fp_y(ty * oc_iso::FP + oc_iso::FP),
            0,
            20,
            kind as i32,
        );
        if kind == buildings::B_PAD {
            // A freshly finished pad is already reloaded and ready to launch.
            let b = &mut world.buildings[i];
            b.aux = 0;
            b.charge = 0;
        }
    }
    repair::update(world, dt_ms);
    hangar::update(world, dt_ms);
}
