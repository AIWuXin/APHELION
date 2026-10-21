//! Windows resources for `aphelion-desktop.exe`.
//!
//! Embeds the generated icon, the application manifest (asInvoker,
//! PerMonitorV2, Win10/11, common controls v6) and a VERSIONINFO block whose
//! version comes from `CARGO_PKG_VERSION`. On non-Windows hosts this is a no-op,
//! so `cargo build` / `cargo test` on Linux never needs `rc.exe`.
//!
//! The icon is a committed build input, not a build-time generation step:
//! `assets/icon.ico` is produced once by `node scripts/gen-icon.mjs`.

fn main() {
    #[cfg(windows)]
    windows_resources();
}

#[cfg(windows)]
fn windows_resources() {
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

    let version = std::env::var("CARGO_PKG_VERSION").expect("CARGO_PKG_VERSION is set by Cargo");
    let numeric = version.split('-').next().unwrap_or("0.0.0");
    let mut parts = numeric
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0));
    let major = parts.next().unwrap_or(0);
    let minor = parts.next().unwrap_or(0);
    let patch = parts.next().unwrap_or(0);
    // Cargo needs `0.1.0-a0`; VERSIONINFO strings and the UI use `0.1.0a0`
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
