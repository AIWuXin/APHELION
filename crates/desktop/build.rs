//! Windows resources for `aphelion-desktop.exe`.
//!
//! Embeds the generated icon, the application manifest (asInvoker,
//! PerMonitorV2, Win10/11, common controls v6) and a VERSIONINFO block whose
//! version comes from `CARGO_PKG_VERSION`. On non-Windows hosts this is a no-op,
//! so `cargo build` / `cargo test` on Linux never needs `rc.exe`.
//!
//! It also injects `OC_BUILD_STAMP` (local build time, minute precision) on every
//! platform: the window title shows it, so an old executable is recognizable.
//! The clock is a local one because that is what the user compares against file
//! timestamps; std has no time zone database, so on Windows it comes from
//! PowerShell and everywhere else (or on failure) from the UTC fallback.
//!
//! The icon is a committed build input, not a build-time generation step:
//! `assets/icon.ico` is produced once by `node scripts/gen-icon.mjs`.

fn main() {
    // Compile-time build identity, exposed to the crate as `OC_BUILD_STAMP`
    // (`2026-10-22 11:20`, local time, minute precision). The window title and,
    // via `vite.config.ts`, the in-game status bar show it, so a stale
    // executable can be told apart from a fresh one at a glance.
    // `zone` is only consumed by the Windows resource block; the underscore
    // keeps `-D warnings` happy when this script compiles on other hosts.
    let (stamp, _zone) = local_stamp();
    println!("cargo:rustc-env=OC_BUILD_STAMP={stamp}");
    #[cfg(windows)]
    windows_resources(&stamp, _zone);
}

/// Current local time as `YYYY-MM-DD HH:MM`, falling back to UTC when the host
/// clock cannot be read. The second element names the zone actually used.
///
/// `std` cannot resolve a time zone, so on Windows the formatted local time is
/// taken from PowerShell — the same number the user sees in Explorer. Any
/// failure (non-Windows host, `powershell` missing or blocked, unexpected
/// output) silently degrades to [`utc_stamp`] rather than failing the build.
fn local_stamp() -> (String, &'static str) {
    if cfg!(windows) {
        if let Some(stamp) = powershell_stamp() {
            return (stamp, "local");
        }
    }
    (utc_stamp(), "UTC")
}

/// `YYYY-MM-DD HH:MM` from `Get-Date`, or `None` if PowerShell is unavailable.
fn powershell_stamp() -> Option<String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-Date -Format 'yyyy-MM-dd HH:mm'",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stamp = String::from_utf8(output.stdout).ok()?;
    let stamp = stamp.trim();
    // Guard the shape: a stray banner or a localized format must not end up in
    // the title bar, where `window.rs` splits on `-`, `:` and space.
    let shaped = stamp.len() == 16
        && stamp.as_bytes()[4] == b'-'
        && stamp.as_bytes()[7] == b'-'
        && stamp.as_bytes()[10] == b' '
        && stamp.as_bytes()[13] == b':'
        && stamp
            .bytes()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7 | 10 | 13) || byte.is_ascii_digit());
    shaped.then_some(stamp.to_owned())
}

/// Fallback build time as `YYYY-MM-DD HH:MM` in UTC, without a date crate.
///
/// The civil-date conversion is Howard Hinnant's `civil_from_days`
/// (<https://howardhinnant.github.io/date_algorithms.html>).
fn utc_stamp() -> String {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    let days = (seconds / 86_400) as i64;
    let hour = (seconds % 86_400) / 3_600;
    let minute = (seconds % 3_600) / 60;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}")
}

#[cfg(windows)]
fn windows_resources(build_stamp: &str, build_zone: &str) {
    use std::fmt::Write as _;
    use std::path::PathBuf;

    let manifest_dir = PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by Cargo"),
    );
    let root = manifest_dir.join("..").join("..");
    let icon = root.join("assets").join("icon.ico");
    let manifest = manifest_dir.join("aphelion-desktop.exe.manifest");

    if !icon.is_file() {
        panic!(
            "缺少 {}；请先运行 `node scripts/gen-icon.mjs` 生成桌面图标。",
            icon.display()
        );
    }
    if !manifest.is_file() {
        panic!("缺少应用清单 {}", manifest.display());
    }
    println!("cargo:rerun-if-changed={}", icon.display());
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rerun-if-changed=build.rs");
    // Refresh policy for `OC_BUILD_STAMP`: with `rerun-if-changed` declared,
    // Cargo only reruns this script when an input changes, so a stamp per
    // build is not free. Watching `src` makes the stamp change whenever the
    // crate's code does — i.e. whenever a rebuilt executable actually differs.
    // An unchanged tree yields an unchanged stamp, which is the honest answer.
    // `embed-resource` emits no `rerun-if-changed` of its own, so listing the
    // icon and manifest here is what keeps `rc.exe` from running every build.
    println!("cargo:rerun-if-changed=src");
    // The embedded web bundle is built by `vite` right before this crate, so
    // watching it keeps the window title's stamp in step with the status bar's:
    // both halves of one executable then report the same build. A tree without
    // `dist/` merely reruns this script every build (one extra `rc.exe`).
    println!("cargo:rerun-if-changed={}", root.join("dist").display());

    let version = std::env::var("CARGO_PKG_VERSION").expect("CARGO_PKG_VERSION is set by Cargo");
    let numeric = version.split('-').next().unwrap_or("0.0.0");
    let mut parts = numeric
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0));
    let major = parts.next().unwrap_or(0);
    let minor = parts.next().unwrap_or(0);
    let patch = parts.next().unwrap_or(0);
    // Cargo needs `0.1.0-a2`; VERSIONINFO strings and the UI use `0.1.0a2`
    // (same mapping as `scripts/package-exe.mjs` and PRODUCT_VERSION).
    let display_version = version.replace('-', "");

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set by Cargo"));
    let rc_path = out_dir.join("aphelion-desktop.rc");
    // Forward slashes keep the generated RC free of backslash escapes; rc.exe
    // accepts them on every supported Windows toolchain.
    let icon_rc = icon.to_string_lossy().replace('\\', "/");
    let manifest_rc = manifest.to_string_lossy().replace('\\', "/");

    let mut rc = String::new();
    let _ = writeln!(rc, "1 ICON \"{icon_rc}\"");
    let _ = writeln!(rc, "1 24 \"{manifest_rc}\"");
    let _ = writeln!(rc, "1 VERSIONINFO");
    let _ = writeln!(rc, "FILEVERSION {major},{minor},{patch},0");
    let _ = writeln!(rc, "PRODUCTVERSION {major},{minor},{patch},0");
    let _ = writeln!(rc, "FILEFLAGSMASK 0x3fL");
    let _ = writeln!(rc, "FILEFLAGS 0x0L");
    let _ = writeln!(rc, "FILEOS 0x40004L");
    let _ = writeln!(rc, "FILETYPE 0x1L");
    let _ = writeln!(rc, "FILESUBTYPE 0x0L");
    let _ = writeln!(rc, "BEGIN");
    let _ = writeln!(rc, "  BLOCK \"StringFileInfo\"");
    let _ = writeln!(rc, "  BEGIN");
    let _ = writeln!(rc, "    BLOCK \"040904b0\"");
    let _ = writeln!(rc, "    BEGIN");
    let _ = writeln!(rc, "      VALUE \"CompanyName\", \"APHELION\"");
    let _ = writeln!(
        rc,
        "      VALUE \"Comments\", \"build {build_stamp} {build_zone}\""
    );
    let _ = writeln!(rc, "      VALUE \"FileDescription\", \"APHELION Desktop\"");
    let _ = writeln!(rc, "      VALUE \"FileVersion\", \"{display_version}\"");
    let _ = writeln!(rc, "      VALUE \"InternalName\", \"aphelion-desktop\"");
    let _ = writeln!(
        rc,
        "      VALUE \"OriginalFilename\", \"aphelion-desktop.exe\""
    );
    let _ = writeln!(rc, "      VALUE \"ProductName\", \"APHELION\"");
    let _ = writeln!(rc, "      VALUE \"ProductVersion\", \"{display_version}\"");
    let _ = writeln!(rc, "    END");
    let _ = writeln!(rc, "  END");
    let _ = writeln!(rc, "  BLOCK \"VarFileInfo\"");
    let _ = writeln!(rc, "  BEGIN");
    let _ = writeln!(rc, "    VALUE \"Translation\", 0x409, 1200");
    let _ = writeln!(rc, "  END");
    let _ = writeln!(rc, "END");

    if let Err(error) = std::fs::write(&rc_path, rc) {
        panic!("无法写入资源描述 {}: {error}", rc_path.display());
    }

    embed_resource::compile(&rc_path, embed_resource::NONE)
        .manifest_required()
        .expect("嵌入 Windows 图标 / 清单 / VERSIONINFO 失败");
}
