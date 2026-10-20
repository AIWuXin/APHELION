//! Tuning constants. The simulation reads numbers from here so balance changes
//! never require touching system code.

/// Starting alloy.
pub const START_ALLOY: i32 = 420;
/// Starting fuel cells.
pub const START_FUEL: i32 = 90;
/// Starting research points.
pub const START_RESEARCH: i32 = 0;

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
/// Ground raiders per drop pod.
pub const RAIDERS_PER_DROP: u8 = 2;

/// Damage multiplier permille for the ballistics tech.
pub const BALLISTICS_BONUS: i32 = 300;
/// Refinery multiplier permille for the materials tech.
pub const MATERIALS_BONUS: i32 = 250;
