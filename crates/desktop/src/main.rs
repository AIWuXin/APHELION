//! APHELION desktop entry point.
//!
//! Primary path: a tao window with a wry/WebView2 view loaded from the embedded
//! `dist/` bundle through the `aphelion://` custom protocol. No HTTP port, no
//! external browser. When WebView2 is absent or window creation fails, the
//! process falls back to exactly the launcher path (loopback HTTP + default
//! browser) and prints why.
//!
//! Usage:
//!   aphelion-desktop.exe                 # native window
//!   aphelion-desktop.exe --seed 42       # fixed world, ?seed=42
//!   aphelion-desktop.exe --debug         # debug overlay + ?debug=1
//!   aphelion-desktop.exe --browser       # force the browser fallback
//!   aphelion-desktop.exe --help

// Release builds are GUI applications and must not flash a console window.
// Debug builds keep the console so the smoke test and developers can read logs.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

#[cfg(windows)]
use std::io::Write as _;
use std::process::ExitCode;

use oc_launcher::console;

mod protocol;
mod webview2;
#[cfg(windows)]
mod window;

/// Command line options.
struct Options {
    /// Fixed world seed (`?seed=`).
    seed: Option<u32>,
    /// Open the in-page debug overlay (`?debug=1`).
    debug: bool,
    /// Skip the native window and go straight to the browser fallback.
    browser: bool,
}

impl Options {
    /// Build the query string passed to the page and to the fallback URL.
    fn query(&self) -> String {
        let mut parts = Vec::new();
        if let Some(seed) = self.seed {
            parts.push(format!("seed={seed}"));
        }
        if self.debug {
            parts.push("debug=1".to_string());
        }
        parts.join("&")
    }
}

/// Parse the desktop command line.
///
/// `--help` prints and exits (matching `aphelion.exe`); every other error is
/// returned so `main` can print it and use exit code 2.
fn parse_args() -> Result<Options, String> {
    let mut options = Options {
        seed: None,
        debug: false,
        browser: false,
    };
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--seed" => {
                let value = args.next().ok_or("--seed 需要一个种子号")?;
                options.seed = Some(value.parse().map_err(|_| format!("种子无效: {value}"))?);
            }
            "--debug" => options.debug = true,
            "--browser" => options.browser = true,
            "--help" | "-h" => {
                println!(
                    "APHELION {} 桌面版\n\n  aphelion-desktop.exe [--seed N] [--debug] [--browser]\n\n\
                     默认创建系统 WebView2 窗口；缺少 WebView2 或窗口创建失败时自动回退到浏览器。\n\
                     --seed N    固定世界种子（等价于网页版 ?seed=N）\n\
                     --debug     打开调试层与 DevTools（等价于 ?debug=1）\n\
                     --browser   跳过窗口，直接用默认浏览器打开\n\
                     --help      显示本帮助",
                    oc_protocol::PRODUCT_VERSION
                );
                std::process::exit(0);
            }
            other => return Err(format!("未知参数: {other}")),
        }
    }
    Ok(options)
}

fn main() -> ExitCode {
    console::prepare();
    let options = match parse_args() {
        Ok(options) => options,
        Err(message) => {
            eprintln!("参数错误: {message}");
            return ExitCode::from(2);
        }
    };

    match run(options) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("启动失败: {message}");
            ExitCode::from(1)
        }
    }
}

/// Try the native window, then the browser fallback.
///
/// The function blocks for the lifetime of the window (or the HTTP server).
/// It returns only when the event loop exits or the fallback itself fails.
fn run(options: Options) -> Result<(), String> {
    if options.browser {
        return run_browser(&options, "命令行指定了 --browser");
    }

    #[cfg(windows)]
    {
        let query = options.query();
        let Some(version) = webview2::runtime_version() else {
            return run_browser(&options, "未检测到 WebView2 运行库");
        };
        info(&format!("  WebView2 运行库：{version}"));
        match window::run(&query) {
            Ok(()) => Ok(()),
            Err(reason) => run_browser(&options, &reason),
        }
    }
    #[cfg(not(windows))]
    {
        run_browser(&options, "当前平台只构建了浏览器回退")
    }
}

/// Start the launcher's loopback server and open the default browser.
///
/// Used for `--browser`, a missing WebView2 runtime, and any window/WebView
/// creation failure. The query string keeps `--seed` / `--debug` semantics.
fn run_browser(options: &Options, reason: &str) -> Result<(), String> {
    eprintln!("[desktop] {reason}；改用浏览器模式。");
    let query = options.query();
    oc_launcher::run_http_server_with_query(0, true, &query)
        .map_err(|error| format!("无法绑定本地端口: {error}"))
}

/// Print one startup log line and flush it immediately.
///
/// stdout is block-buffered when redirected to a file, so an unflushed line
/// would be lost if the smoke test terminates the process.
#[cfg(windows)]
fn info(message: &str) {
    println!("{message}");
    let _ = std::io::stdout().flush();
}
