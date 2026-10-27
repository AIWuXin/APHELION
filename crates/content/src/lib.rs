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
        assert_eq!(c.events.len(), 16);
        assert_eq!(c.techs.len(), 4);
    }

    #[test]
    fn tiers_match_the_era_plan() {
        let c = catalog();
        let tier = |kind: u8| c.buildings[kind as usize].tier;
        // T1: the whole opening kit, including the new coal pair.
        for kind in [
            buildings::B_HQ,
            buildings::B_SOLAR,
            buildings::B_REFINERY,
            buildings::B_COAL_MINE,
            buildings::B_COAL_PLANT,
            buildings::B_TURRET,
            buildings::B_BULWARK,
        ] {
            assert_eq!(
                tier(kind),
                1,
                "{} should be tier 1",
                c.buildings[kind as usize].key
            );
        }
        // T2: chemistry, research and the anti-air layer.
        for kind in [
            buildings::B_FUEL,
            buildings::B_LAB,
            buildings::B_FLAK,
            buildings::B_RADAR,
            buildings::B_REPAIR,
        ] {
            assert_eq!(
                tier(kind),
                2,
                "{} should be tier 2",
                c.buildings[kind as usize].key
            );
        }
        // T3: the space programme.
        for kind in [
            buildings::B_PAD,
            buildings::B_DOCK,
            buildings::B_RELAY,
            buildings::B_HANGAR,
        ] {
            assert_eq!(
                tier(kind),
                3,
                "{} should be tier 3",
                c.buildings[kind as usize].key
            );
        }
        assert_eq!(c.buildings.len(), buildings::B_COUNT as usize);
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
        let hub = &c.buildings[buildings::B_HQ as usize];
        assert_eq!(hub.key, "command-hub");
        // The hub is the colony landmark: 3x3, strictly larger than every other
        // row, so the silhouette difference reads before any detail does.
        assert_eq!(hub.footprint, 3);
        for (i, row) in c.buildings.iter().enumerate() {
            if i != buildings::B_HQ as usize {
                assert!(
                    row.footprint < hub.footprint,
                    "{} rivals the command hub's footprint",
                    row.key
                );
            }
        }
    }
}
