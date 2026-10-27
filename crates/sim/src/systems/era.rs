//! Normal campaign era milestones. Runs after the director so wave resolution
//! and construction from this tick are already authoritative.

use oc_content::buildings;
use oc_protocol::{EVENT_ERA, STATUS_RUNNING};

use crate::world::World;

/// Unlock the next era only when the player completed the preceding game loop.
pub fn update(world: &mut World) {
    if world.status != STATUS_RUNNING {
        return;
    }
    let next = match world.era {
        1 if world.wave >= 1
            && !world.wave_in_flight
            && world.count_done(buildings::B_COAL_MINE) > 0
            && world.count_done(buildings::B_COAL_PLANT) > 0 =>
        {
            2
        }
        2 if world.count_done(buildings::B_OIL_WELL) > 0
            && world.count_done(buildings::B_FUEL) > 0 =>
        {
            3
        }
        _ => return,
    };
    world.era = next;
    let (tx, ty) = if next == 2 {
        world.map.oil_home
    } else {
        world.map.start
    };
    world.event(EVENT_ERA, u32::from(next), 0, tx as i16, ty as i16);
}
