//! APHELION — single-file browser launcher.
//!
//! Serves the embedded web client on `127.0.0.1` and opens the user's default
//! browser. The reusable half lives in `lib.rs`; `oc-desktop` uses the same
//! asset table and keeps this HTTP path as its fallback. Rationale (see
//! `docs/decisions.md` D-09): the browser path needs no WebView2, no Node.js and
//! no installer, while the exact same `dist/` still works when served anywhere.
//!
//! Usage:
//!   aphelion.exe              # auto port, opens the browser
//!   aphelion.exe --port 8137  # fixed port
//!   aphelion.exe --no-open    # headless / for automation
//!   aphelion.exe --help

use std::process::ExitCode;

use oc_launcher::{console, run_http_server};

/// Command line options.
struct Options {
    port: u16,
    open_browser: bool,
}

fn parse_args() -> Result<Options, String> {
    let mut options = Options {
        port: 0,
        open_browser: true,
    };
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" | "-p" => {
                let value = args.next().ok_or("--port 需要一个端口号")?;
                options.port = value.parse().map_err(|_| format!("端口无效: {value}"))?;
            }
            "--no-open" => options.open_browser = false,
            "--help" | "-h" => {
                println!(
                    "APHELION {}\n\n  aphelion.exe [--port N] [--no-open]\n\n\
                     默认自动选择空闲端口并用系统默认浏览器打开。关闭本窗口即退出。",
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

    match run_http_server(options.port, options.open_browser) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("无法绑定本地端口: {error}");
            ExitCode::from(1)
        }
    }
}
