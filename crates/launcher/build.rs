//! Embeds the built web client into the launcher binary.
//!
//! `pnpm run build` (or `node scripts/package-exe.mjs`) produces `dist/`; this
//! build script walks it and writes an `assets.rs` that `include_bytes!`es every
//! file, so the resulting `.exe` is a single self-contained file.
//!
//! When `dist/` is missing (plain `cargo test` / `cargo clippy` on a clean
//! checkout) the asset table is simply empty and the launcher serves an
//! instruction page instead -- the workspace still builds and lints.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};

fn mime_for(path: &str) -> &'static str {
    match path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "png" => "image/png",
        "woff2" => "font/woff2",
        "txt" | "map" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(root, &path, out);
        } else {
            out.push(path.clone());
            let _ = root;
        }
    }
}

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let dist = manifest.join("..").join("..").join("dist");
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));

    // Rebuild whenever the web bundle changes.
    println!("cargo:rerun-if-changed={}", dist.display());

    let mut files = Vec::new();
    if dist.is_dir() {
        walk(&dist, &dist, &mut files);
        files.sort();
    }

    let mut code =
        String::from("/// Every file of the built web client, as (url path, mime, bytes).\n");
    code.push_str("pub static ASSETS: &[(&str, &str, &[u8])] = &[\n");
    for file in &files {
        let rel = file
            .strip_prefix(&dist)
            .unwrap_or(file)
            .to_string_lossy()
            .replace('\\', "/");
        let mime = mime_for(&rel);
        let abs = file.to_string_lossy().to_string();
        // `{:?}` produces a properly escaped Rust string literal for the path.
        let _ = writeln!(
            code,
            "    (\"/{rel}\", \"{mime}\", include_bytes!({abs:?})),"
        );
    }
    code.push_str("];\n");

    let generated = out_dir.join("assets.rs");
    if std::fs::write(&generated, code).is_err() {
        println!("cargo:warning=could not write assets.rs");
    }
    println!("cargo:rustc-env=OC_ASSET_COUNT={}", files.len());
}
