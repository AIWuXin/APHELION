//! Static content: buildings, units, lanes, events, techs and the tuning
//! constants that the simulation reads.
//!
//! **This crate is the only place content data lives.** Adding a building means
//! appending one row to [`buildings::BUILDINGS`]; the codegen test then updates
//! `web/src/generated/content-keys.ts`, which makes the TypeScript render
//! registry fail to compile until the matching draw function exists. Two edits,
//! both compiler-enforced.

pub mod balance;
pub mod buildings;
pub mod events;
pub mod keys;
pub mod routes;
pub mod techs;
pub mod terrain;
pub mod units;

use oc_protocol::{Catalog, PROTOCOL_VERSION};

/// Build the catalogue sent to the client on start-up.
#[must_use]
pub fn catalog() -> Catalog {
    Catalog {
        protocol: PROTOCOL_VERSION,
        buildings: buildings::BUILDINGS.iter().map(buildings::to_def).collect(),
        units: units::UNITS.iter().map(units::to_def).collect(),
        routes: routes::ROUTES.iter().map(routes::to_def).collect(),
        events: events::EVENTS.iter().map(events::to_def).collect(),
        techs: techs::TECHS.iter().map(techs::to_def).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_matches_table_lengths() {
        let c = catalog();
        assert_eq!(c.protocol, PROTOCOL_VERSION);
        assert_eq!(c.buildings.len(), buildings::B_COUNT as usize);
        assert_eq!(c.units.len(), units::U_COUNT as usize);
        assert_eq!(c.routes.len(), routes::R_COUNT as usize);
        assert_eq!(c.events.len(), 13);
        assert_eq!(c.techs.len(), 4);
    }

    #[test]
    fn catalog_survives_a_postcard_round_trip() {
        let c = catalog();
        let bytes = postcard::to_allocvec(&c).expect("encode catalog");
        let back: Catalog = postcard::from_bytes(&bytes).expect("decode catalog");
        assert_eq!(back.buildings.len(), c.buildings.len());
        assert_eq!(back.buildings[0].key, c.buildings[0].key);
        assert_eq!(back.routes[2].name_zh, c.routes[2].name_zh);
    }

    #[test]
    fn first_building_is_the_command_hub() {
        let c = catalog();
        assert_eq!(c.buildings[buildings::B_HQ as usize].key, "command-hub");
        assert_eq!(c.buildings[buildings::B_HQ as usize].footprint, 2);
    }
}
