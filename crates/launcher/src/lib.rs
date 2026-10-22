//! Reusable pieces of the APHELION launcher.
//!
//! The crate started as a single-file binary that embedded `dist/`, served it
//! over loopback HTTP and opened the default browser (see `docs/decisions.md`
//! D-09/D-12). `oc-desktop` now reuses exactly those pieces twice:
//!
//! * the embedded asset table feeds the WebView custom protocol, so the native
//!   window and the browser see the same bytes;
//! * the HTTP server and `open_browser` remain the fallback path when WebView2
//!   is missing or the native window cannot be created.
//!
//! Keeping the code here avoids a second `include_bytes!` table and guarantees
//! that `aphelion.exe` and `aphelion-desktop.exe` ship the same client.

use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};

#[cfg(any(windows, test))]
mod browser;
pub mod console;
mod embedded {
    include!(concat!(env!("OUT_DIR"), "/assets.rs"));
}

use embedded::ASSETS;

/// Shown when the binary was built without a `dist/` bundle.
pub const NO_BUNDLE_HTML: &str = "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\">\
<title>APHELION</title><body style=\"background:#05090a;color:#c9d6d6;\
font:14px 'Microsoft YaHei',sans-serif;padding:40px;line-height:1.8\">\
<h1 style=\"color:#f0c050;font-size:18px;letter-spacing:.2em\">APHELION</h1>\
<p>这个可执行文件里没有前端资源。</p>\
<p>请先构建并打包：<code style=\"color:#88d8e8\">node scripts/package-exe.mjs</code></p>\
</body></html>";

/// 返回构建时内嵌的前端资源表，元素为 `(URL 路径, MIME, 字节)`。
///
/// 路径总以 `/` 开头（例如 `/index.html`、`/oc.wasm`）。当构建机没有 `dist/`
/// 时表为空，调用方应退化为 [`NO_BUNDLE_HTML`] 提示页。
#[must_use]
pub fn assets() -> &'static [(&'static str, &'static str, &'static [u8])] {
    ASSETS
}

/// 按 URL 路径查找一个内嵌资源，返回 `(MIME, 字节)`。
///
/// 只做精确匹配；路径消毒由调用方负责（桌面端的自定义协议会先拒绝 `..`）。
#[must_use]
pub fn find_asset(path: &str) -> Option<(&'static str, &'static [u8])> {
    ASSETS
        .iter()
        .find(|(name, _, _)| *name == path)
        .map(|(_, mime, bytes)| (*mime, *bytes))
}

/// 启动内嵌客户端的 loopback HTTP 服务，行为与 `aphelion.exe` 完全一致。
///
/// 绑定 `port`（`0` 表示自动选择空闲端口），打印横幅，按需打开浏览器，然后
/// 阻塞处理连接。绑定失败时返回错误，调用方负责打印并决定退出码。
pub fn run_http_server(port: u16, open_in_browser: bool) -> std::io::Result<()> {
    run_http_server_with_query(port, open_in_browser, "")
}

/// 与 [`run_http_server`] 相同，但给打开的服务地址追加查询串。
///
/// `query` 是不含 `?` 的查询串（例如 `seed=42&debug=1`），空串表示不追加。
/// 桌面端回退时用它保留 `--seed` / `--debug` 的语义。
pub fn run_http_server_with_query(
    port: u16,
    open_in_browser: bool,
    query: &str,
) -> std::io::Result<()> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let listener = TcpListener::bind(addr)?;
    let port = listener.local_addr().map_or(port, |address| address.port());
    let url = if query.is_empty() {
        format!("http://127.0.0.1:{port}/")
    } else {
        format!("http://127.0.0.1:{port}/?{query}")
    };

    println!();
    println!("  APHELION {}", oc_protocol::PRODUCT_VERSION);
    println!("  远日点 · 等距殖民地 / 轨道物流 / 舰队防御");
    println!();
    if ASSETS.is_empty() {
        println!("  [警告] 此二进制未内嵌前端资源（构建时缺少 dist/）");
    } else {
        println!("  内嵌资源 {} 个，服务地址：{url}", ASSETS.len());
    }
    println!("  关闭本窗口或按 Ctrl+C 退出。");
    println!();

    if open_in_browser {
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
    Ok(())
}

/// 用系统默认浏览器打开 `url`。
///
/// 优先直接 spawn 注册表里的默认浏览器可执行文件；失败时回退到
/// `cmd /c start "" <url>`；两条路径都失败才提示用户手动访问。macOS / Linux
/// 分别使用 `open` / `xdg-open`。
pub fn open_browser(url: &str) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: do not flash a console for the `cmd /c start` shim.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let mut opened = browser::spawn_default_browser(url);
        if !opened {
            opened = std::process::Command::new("cmd")
                .args(["/c", "start", "", url])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .is_ok();
        }
        if !opened {
            eprintln!("  无法自动打开浏览器，请手动访问：{url}");
        }
        println!("  若浏览器未自动打开或提示权限问题，请手动复制上述地址访问。");
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
