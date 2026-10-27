//! Sandbox switches, tech bits and stockpile arithmetic.
//!
//! Kept out of `world.rs` so the core state machine stays short; these are the
//! only places that apply the "infinite resources" sandbox flag, which is why
//! systems must go through them instead of touching `res` directly.

use oc_content::balance;

use super::{World, MAX_ALLOY, SANDBOX_INFINITE};

impl World {
    /// Is a sandbox flag on? Bit values live in [`super::SANDBOX_INFINITE`],
    /// [`super::SANDBOX_INSTANT`] and [`super::SANDBOX_DEBUG`].
    #[must_use]
    pub const fn sandbox(&self, bit: u16) -> bool {
        self.policy.sandbox_flags & bit != 0
    }

    /// Is a tech researched? `255` means "no tech required" and always passes.
    #[must_use]
    pub const fn has_tech(&self, tech: u8) -> bool {
        if tech == 255 {
            return true;
        }
        self.techs & (1 << (tech & 31)) != 0
    }

    /// Add alloy respecting sandbox mode.
    pub fn add_alloy(&mut self, amount: i32) {
        if self.sandbox(SANDBOX_INFINITE) {
            self.res.alloy = self.res.alloy.max(balance::SANDBOX_RESOURCE_FLOOR);
            return;
        }
        self.res.alloy = (self.res.alloy + amount).clamp(0, MAX_ALLOY);
    }

    /// Spend alloy if possible.
    pub fn take_alloy(&mut self, amount: i32) -> bool {
        if self.sandbox(SANDBOX_INFINITE) {
            return true;
        }
        if self.res.alloy >= amount {
            self.res.alloy -= amount;
            true
        } else {
            false
        }
    }

    /// Spend fuel cells if possible.
    pub fn take_fuel(&mut self, amount: i32) -> bool {
        if self.sandbox(SANDBOX_INFINITE) {
            return true;
        }
        if self.res.fuel >= amount {
            self.res.fuel -= amount;
            true
        } else {
            false
        }
    }

    /// Deliver crude oil to the colony stockpile.
    pub fn add_oil(&mut self, amount: i32) {
        if self.sandbox(SANDBOX_INFINITE) {
            self.res.oil = self.res.oil.max(balance::SANDBOX_RESOURCE_FLOOR);
            return;
        }
        self.res.oil = (self.res.oil + amount).clamp(0, super::MAX_OIL);
    }

    /// Spend delivered crude oil if possible.
    pub fn take_oil(&mut self, amount: i32) -> bool {
        if self.sandbox(SANDBOX_INFINITE) {
            return true;
        }
        if self.res.oil >= amount {
            self.res.oil -= amount;
            true
        } else {
            false
        }
    }
}
