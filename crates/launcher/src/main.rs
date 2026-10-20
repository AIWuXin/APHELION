//! APHELION — single-file desktop launcher.
//!
//! Serves the embedded web client on `127.0.0.1` and opens the user's default
//! browser. Rationale (see `docs/decisions.md` D-09): the brief requires the
//! game to run in a browser, and the HUD's 1px borders and CJK text must be laid
//! out by a real browser engine. Wrapping that in a std-only HTTP server plus
//! `ShellExecute` gives a double-clickable `exe` with no WebView2, no Node.js and
//! no installer, while the exact same `dist/` still works when served anywhere.
//!
//! Usage:
//!   aphelion.exe              # auto port, opens the browser
//!   aphelion.exe --port 8137  # fixed port
//!   aphelion.exe --no-open    # headless / for automation
//!   aphelion.exe --help

use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::process::ExitCode;

mod console;
mod embedded {
    include!(concat!(env!("OUT_DIR"), "/assets.rs"));
}

use embedded::ASSETS;

/// Shown when the binary was built without a `dist/` bundle.
const NO_BUNDLE_HTML: &str = "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\">\
<title>APHELION</title><body style=\"background:#05090a;color:#c9d6d6;\
font:14px 'Microsoft YaHei',sans-serif;padding:40px;line-height:1.8\">\
<h1 style=\"color:#f0c050;font-size:18px;letter-spacing:.2em\">APHELION</h1>\
<p>这个可执行文件里没有前端资源。</p>\
<p>请先构建并打包：<code style=\"color:#88d8e8\">node scripts/package-exe.mjs</code></p>\
</body></html>";

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

    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, options.port));
    let listener = match TcpListener::bind(addr) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("无法绑定本地端口: {error}");
            return ExitCode::from(1);
        }
    };
    let port = listener
        .local_addr()
        .map_or(options.port, |address| address.port());
    let url = format!("http://127.0.0.1:{port}/");

    println!();
    println!("  APHELION {}", oc_protocol::PRODUCT_VERSION);
    println!("  远日点指挥终端 · 等距殖民地 / 轨道物流 / 舰队防御");
    println!();
    if ASSETS.is_empty() {
        println!("  [警告] 此二进制未内嵌前端资源（构建时缺少 dist/）");
    } else {
        println!("  内嵌资源 {} 个，服务地址：{url}", ASSETS.len());
    }
    println!("  关闭本窗口或按 Ctrl+C 退出。");
    println!();

    if options.open_browser {
        open_browser(&url);
    }

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                std::thread::spawn(move || {
                    let _ = serve(stream);
                });
            }
            Err(error) => eprintln!("连接失败: {error}"),
        }
    }
    ExitCode::SUCCESS
}

/// Answer one HTTP request.
fn serve(mut stream: TcpStream) -> std::io::Result<()> {
    stream.set_read_timeout(Some(std::time::Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(std::time::Duration::from_secs(10)))?;

    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line)? == 0 {
        return Ok(());
    }
    // Drain the remaining headers; we do not use any of them.
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header)? == 0 || header == "\r\n" || header == "\n" {
            break;
        }
        if header.len() > 8192 {
            break;
        }
    }

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");
    if method != "GET" && method != "HEAD" {
        return respond(
            &mut stream,
            405,
            "text/plain; charset=utf-8",
            b"method not allowed",
            method == "HEAD",
        );
    }

    let path = target.split(['?', '#']).next().unwrap_or("/");
    let path = if path == "/" { "/index.html" } else { path };
    if !path.starts_with('/') || path.contains("..") {
        return respond(
            &mut stream,
            400,
            "text/plain; charset=utf-8",
            b"bad request",
            method == "HEAD",
        );
    }

    if ASSETS.is_empty() {
        return respond(
            &mut stream,
            200,
            "text/html; charset=utf-8",
            NO_BUNDLE_HTML.as_bytes(),
            method == "HEAD",
        );
    }

    match ASSETS.iter().find(|(name, _, _)| *name == path) {
        Some((_, mime, bytes)) => respond(&mut stream, 200, mime, bytes, method == "HEAD"),
        None => respond(
            &mut stream,
            404,
            "text/plain; charset=utf-8",
            b"not found",
            method == "HEAD",
        ),
    }
}

/// Write a minimal HTTP/1.1 response.
fn respond(
    stream: &mut TcpStream,
    status: u16,
    mime: &str,
    body: &[u8],
    head_only: bool,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Error",
    };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    if !head_only {
        stream.write_all(body)?;
    }
    stream.flush()
}

/// Open the URL in the system default browser.
fn open_browser(url: &str) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: do not flash a console for the `cmd /c start` shim.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let spawned = std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        if spawned.is_err() {
            eprintln!("  无法自动打开浏览器，请手动访问：{url}");
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}
