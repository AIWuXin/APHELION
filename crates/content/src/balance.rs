//! Tuning constants. The simulation reads numbers from here so balance changes
//! never require touching system code.

/// Starting alloy.
pub const START_ALLOY: i32 = 420;
/// Starting fuel cells.
pub const START_FUEL: i32 = 90;
/// Starting research points.
pub const START_RESEARCH: i32 = 0;
/// Starting coal. Zero on purpose: T1 opens on solar power, and the first
/// coal seam has to be mined before a thermal plant can carry the grid.
pub const START_COAL: i32 = 0;

/// Seconds until the first hostile wave.
pub const FIRST_WAVE_S: u32 = 135;
/// Seconds between waves after the first.
pub const WAVE_INTERVAL_S: u32 = 110;
/// Minimum seconds between waves.
pub const WAVE_INTERVAL_MIN_S: u32 = 70;
/// Waves survived to win.
pub const WAVES_TO_WIN: u16 = 5;

/// Refinery alloy per minute at full power.
pub const REFINERY_PER_MIN: i32 = 46;
/// Coal per minute from an extractor sitting on a fully saturated seam.
pub const COAL_MINE_PER_MIN: i32 = 20;
/// Seam richness that counts as a fully saturated seam. Richness is the sum of
/// `Map::coal` over the 2x2 footprint; the guaranteed seam next to the colony
/// is 120 per tile (= 480 over four tiles), so a mine on it runs at 100% and
/// wild seams scale linearly down from there.
pub const COAL_SEAM_FULL: i32 = 480;
/// Coal burned per minute by one thermal plant to make its 40 energy.
pub const COAL_BURN_PER_MIN: i32 = 10;
/// Fuel synth fuel cells per minute.
pub const FUEL_PER_MIN: i32 = 30;
/// Alloy burned by the fuel synth per minute.
pub const FUEL_ALLOY_PER_MIN: i32 = 12;
/// Research lab points per minute. Tuned up from 7: the lab is a 150-alloy
/// investment and the four techs gate the whole orbital/defence layer, so the
/// first tech has to be reachable inside a ~2 minute opening.
pub const LAB_PER_MIN: i32 = 12;

/// Fuel cells consumed per rocket launch.
pub const LAUNCH_FUEL: i32 = 55;
/// Alloy consumed per rocket launch.
pub const LAUNCH_ALLOY: i32 = 40;
/// Orbital capacity granted per rocket.
pub const LAUNCH_CAPACITY: u16 = 3;
/// Rocket flight time to orbit, in ms.
pub const LAUNCH_ASCENT_MS: u32 = 5200;
/// Launch pad reload time in ms.
pub const PAD_RELOAD_MS: u32 = 9000;

/// Demolish refund, in permille of the build cost.
pub const DEMOLISH_REFUND: i32 = 400;
/// Sandbox instant build multiplier (buildings finish in one tick).
pub const SANDBOX_INSTANT_BUILD: bool = true;
/// Sandbox infinite resource floor.
pub const SANDBOX_RESOURCE_FLOOR: i32 = 999_900;

/// Interceptor produced by a hangar, in ms.
pub const HANGAR_INTERVAL_MS: u32 = 14000;
/// Maximum live interceptors one hangar keeps in the air.
pub const HANGAR_MAX_INTERCEPTORS: u8 = 3;
/// Repair bay healing per second.
pub const REPAIR_PER_S: i32 = 9;

/// Extra orbital capacity every rocket delivers once orbital engineering is
/// researched ("运力 +1"). Relay masts add lift on top (their table capacity).
pub const LAUNCH_ORBITAL_BONUS: u16 = 1;

/// Dropship descent rate in fixed point units per second (1 tile = 1024).
/// Slow enough that flak and interceptors get a real firing window.
pub const DROPSHIP_DESCENT_FP_S: i32 = 220;
/// Fixed point altitude at which a dropship stops descending and lands.
pub const DROPSHIP_LAND_ALT_FP: i32 = 240;
/// Fixed point cruising altitude of a hangar interceptor.
pub const INTERCEPTOR_ALT_FP: i32 = 520;

/// Without a radar array the HUD only learns the wave ETA this close to
/// contact; with a radar array the countdown is visible from the moment the
/// previous wave is cleared.
pub const RADAR_DETECT_MS: u32 = 20_000;
/// With a radar array the fleet is declared inbound this early.
pub const RADAR_WARN_MS: u32 = 45_000;

/// Rail turret damage per shot (permille-scaled by the ballistics tech).
pub const TURRET_DAMAGE: i32 = 26;
/// Rail turret reload time in ms.
pub const TURRET_RELOAD_MS: u32 = 900;
/// Flak battery damage per shot (permille-scaled by the ballistics tech).
pub const FLAK_DAMAGE: i32 = 15;
/// Flak battery reload time in ms.
pub const FLAK_RELOAD_MS: u32 = 520;

/// Alloy awarded for a downed hostile unit.
pub const KILL_ALLOY_UNIT: i32 = 18;
/// Alloy awarded for a downed hostile dropship.
pub const KILL_ALLOY_SHIP: i32 = 25;

/// Drop pods per wave, scaled by AI strength.
pub const DROPS_BASE: u8 = 2;
/// Extra drops at fierce strength.
pub const DROPS_FIERCE_EXTRA: u8 = 2;
/// Ground raiders per drop pod (era 2+) or per ring squad (era 1).
pub const RAIDERS_PER_DROP: u8 = 2;
/// Tiles from a structure at which a ground-only raid counts as engaged
/// (`threat` 2) instead of inbound (`threat` 1). Era 1 has no air layer, so the
/// threat readout is driven by distance to the colony rather than by dropships.
pub const RAID_CONTACT_TILES: i32 = 6;

/// Radius of the era-1 ground-raid ring around the colony hub, in tiles. There
/// is no map edge on a torus, so raids are delivered by angle instead of by
/// walking in from a border.
pub const RAID_RING_TILES: i32 = 24;
/// Angular step tried when a ring tile is deep water, in turn units
/// (`oc_iso::trig::TURN` is one revolution, so 4096 = 22.5 degrees).
pub const RAID_ANGLE_STEP_TURNS: i32 = 4096;
/// Bounded number of ring angles tried before the shallow-water fallback.
pub const RAID_ANGLE_TRIES: i32 = 16;
/// Radius at which era-2+ dropships enter the atmosphere, in tiles. Chosen to
/// match the reach of the old 44x44 map edge (about 30 tiles from the centre) so
/// the orbital assault keeps its pacing on the torus; there is no edge to enter
/// from any more, so they come in on this ring instead.
pub const DROPSHIP_INSERT_RADIUS_TILES: i32 = 28;

/// Damage multiplier permille for the ballistics tech.
pub const BALLISTICS_BONUS: i32 = 300;
/// Refinery multiplier permille for the materials tech.
pub const MATERIALS_BONUS: i32 = 250;
