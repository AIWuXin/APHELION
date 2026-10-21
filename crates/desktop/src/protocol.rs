//! Path handling and responses for the `aphelion://` custom protocol.
//!
//! `wry` maps a custom scheme to `aphelion://localhost/...` on macOS/Linux and
//! to `http://aphelion.localhost/...` inside WebView2 on Windows. The handler
//! receives the *original* scheme URI on every platform (wry reverts its
//! workaround), so this module only looks at the URI path and the embedded
//! asset table. No HTTP port is ever opened on the desktop path.

// The native window (and therefore the protocol handler) is Windows-only. On
// other targets this module is compiled for its path/MIME unit tests, so the
// runtime function bodies are intentionally unused there.
#![cfg_attr(not(windows), allow(dead_code))]

#[cfg(windows)]
use oc_launcher::NO_BUNDLE_HTML;
use oc_launcher::{assets, find_asset};

#[cfg(windows)]
use std::borrow::Cow;
#[cfg(windows)]
use wry::http::{header, Response, StatusCode};

/// Custom URL scheme registered with wry.
pub const SCHEME: &str = "aphelion";

/// Host part of the custom URL. `localhost` is the conventional choice and
/// becomes `aphelion.localhost` in WebView2's rewritten `http://` URL.
pub const HOST: &str = "localhost";

/// 构造交给 `WebViewBuilder::with_url` 的初始 URL。
///
/// `query` 是已经拼好的查询串（不含 `?`，例如 `seed=42&debug=1`）。末尾斜杠
/// 很重要：它让文档 base URL 止于 authority，页面里的 `./assets/...` 才会
/// 落在同一个自定义协议下。
#[must_use]
pub fn initial_url(query: &str) -> String {
    if query.is_empty() {
        format!("{SCHEME}://{HOST}/")
    } else {
        format!("{SCHEME}://{HOST}/?{query}")
    }
}

/// 判断一次导航是否仍停留在内嵌客户端内。
///
/// Windows 上 wry 会把 scheme 重写成 `http://aphelion.localhost`，所以两种写法
/// 都放行；外部链接、`about:blank`、DevTools 一律拦截。
#[must_use]
pub fn navigation_allowed(url: &str) -> bool {
    let scheme = format!("{SCHEME}://{HOST}");
    let webview2 = format!("http://{SCHEME}.{HOST}");
    let webview2_tls = format!("https://{SCHEME}.{HOST}");
    [scheme, webview2, webview2_tls]
        .iter()
        .any(|base| url == base || url.starts_with(&format!("{base}/")))
}

/// What the custom protocol should answer for one request path.
#[derive(Debug, PartialEq, Eq)]
pub enum Asset {
    /// A file from the embedded `dist/` bundle.
    Found {
        /// MIME type sent to the webview.
        mime: &'static str,
        /// File bytes.
        body: &'static [u8],
    },
    /// Path traversal or malformed path; answered with 400.
    BadRequest,
    /// No such asset; answered with 404.
    NotFound,
    /// The binary was built without `dist/`; answered with the instruction page.
    NoBundle,
}

/// 把原始 URI 路径解析成一次响应决策。
///
/// `/` 映射到 `/index.html`；原始或百分号编码形式的 `..` 一律 400；未知路径
/// 404。资源表是精确匹配，即使有路径漏过过滤也无法逃出内嵌包。
#[must_use]
pub fn resolve(raw_path: &str) -> Asset {
    let Some(path) = clean_path(raw_path) else {
        return Asset::BadRequest;
    };
    if assets().is_empty() {
        return if path == "/index.html" {
            Asset::NoBundle
        } else {
            Asset::NotFound
        };
    }
    match find_asset(path) {
        Some((mime, body)) => Asset::Found {
            mime: if mime == "application/octet-stream" {
                mime_for(path)
            } else {
                mime
            },
            body,
        },
        None => Asset::NotFound,
    }
}

/// Validate and normalise a request path.
///
/// Returns `None` for anything that is not an absolute, traversal-free path.
/// Percent escapes are decoded only for validation; the lookup itself uses the
/// original spelling because the asset table is generated from real file names.
fn clean_path(raw_path: &str) -> Option<&str> {
    let path = raw_path.split(['?', '#']).next().unwrap_or("/");
    if path.is_empty() {
        return Some("/index.html");
    }
    if !path.starts_with('/') || path.len() > 8192 {
        return None;
    }
    if path.contains("..") || path.contains('\\') || path.contains('\0') {
        return None;
    }
    let decoded = percent_decode(path);
    if decoded.contains("..") || decoded.contains('\\') || decoded.contains('\0') {
        return None;
    }
    Some(if path == "/" { "/index.html" } else { path })
}

/// Decode `%XX` escapes. Invalid escapes are kept verbatim; this mirrors what a
/// browser would do closely enough for traversal validation.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = (bytes[index + 1] as char).to_digit(16);
            let low = (bytes[index + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                out.push((high * 16 + low) as u8);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// 客户端可能用到的所有扩展名对应的 MIME 表。
///
/// 关键是 `application/wasm`：缺少它时 WebView2 会拒绝流式
/// `WebAssembly.instantiate`，游戏永远启动不了。
#[must_use]
pub fn mime_for(path: &str) -> &'static str {
    let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match extension.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "wasm" => "application/wasm",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "txt" | "map" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// 把 wry 请求转换成交给 WebView 的 HTTP 响应。
///
/// 这里只有内嵌资源表，没有文件系统或网络回退。缺少 `dist/` 时返回与浏览器
/// 启动器相同的说明页。
#[cfg(windows)]
#[must_use]
pub fn respond(request: &wry::http::Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let path = request.uri().path();
    let (status, mime, body): (StatusCode, &'static str, &'static [u8]) = match resolve(path) {
        Asset::Found { mime, body } => (StatusCode::OK, mime, body),
        Asset::NoBundle => (
            StatusCode::OK,
            "text/html; charset=utf-8",
            NO_BUNDLE_HTML.as_bytes(),
        ),
        Asset::BadRequest => (
            StatusCode::BAD_REQUEST,
            "text/plain; charset=utf-8",
            b"bad request",
        ),
        Asset::NotFound => (
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"not found",
        ),
    };

    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, body.len())
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(Cow::Borrowed(body))
        .expect("static response is valid")
}

#[cfg(test)]
mod tests {
    use super::{
        initial_url, mime_for, navigation_allowed, percent_decode, resolve, Asset, HOST, SCHEME,
    };

    #[test]
    fn root_maps_to_index_html() {
        assert_eq!(super::clean_path("/"), Some("/index.html"));
        assert_eq!(super::clean_path(""), Some("/index.html"));
        assert_eq!(super::clean_path("/index.html?x=1"), Some("/index.html"));
    }

    #[test]
    fn asset_paths_are_untouched() {
        assert_eq!(
            super::clean_path("/assets/index-abc.js"),
            Some("/assets/index-abc.js")
        );
        assert_eq!(super::clean_path("/oc.wasm"), Some("/oc.wasm"));
    }

    #[test]
    fn parent_segments_are_rejected() {
        for path in [
            "/../secret",
            "/assets/../../secret",
            "/assets/..%2fsecret",
            "/assets/%2e%2e/secret",
            "/assets/%2E%2E%2Fsecret",
            "/a\\b",
        ] {
            assert_eq!(super::clean_path(path), None, "accepted {path}");
        }
    }

    #[test]
    fn non_absolute_paths_are_rejected() {
        for path in ["index.html", "https://example.com/", "./index.html"] {
            assert_eq!(super::clean_path(path), None, "accepted {path}");
        }
    }

    #[test]
    fn percent_decoding_is_only_for_validation() {
        assert_eq!(percent_decode("/a%20b"), "/a b");
        assert_eq!(percent_decode("%2e%2e"), "..");
        assert_eq!(percent_decode("%zz"), "%zz");
        assert_eq!(percent_decode("%2"), "%2");
    }

    #[test]
    fn percent_encoded_traversal_is_not_resolved() {
        assert_eq!(resolve("/%2e%2e/oc.wasm"), Asset::BadRequest);
        assert_eq!(resolve("/..%5coc.wasm"), Asset::BadRequest);
    }

    #[test]
    fn required_mime_types_are_covered() {
        let cases = [
            ("/index.html", "text/html; charset=utf-8"),
            ("/a.css", "text/css; charset=utf-8"),
            ("/a.js", "text/javascript; charset=utf-8"),
            ("/oc.wasm", "application/wasm"),
            ("/a.png", "image/png"),
            ("/a.svg", "image/svg+xml"),
            ("/a.json", "application/json"),
            ("/a.ico", "image/x-icon"),
        ];
        for (path, expected) in cases {
            assert_eq!(mime_for(path), expected, "wrong MIME for {path}");
        }
    }

    #[test]
    fn unknown_asset_is_404_once_a_bundle_exists() {
        if oc_launcher::assets().is_empty() {
            assert_eq!(resolve("/index.html"), Asset::NoBundle);
        } else {
            assert_eq!(resolve("/does-not-exist"), Asset::NotFound);
        }
    }

    #[test]
    fn initial_url_uses_the_custom_scheme() {
        assert_eq!(initial_url(""), format!("{SCHEME}://{HOST}/"));
        assert_eq!(
            initial_url("seed=7&debug=1"),
            format!("{SCHEME}://{HOST}/?seed=7&debug=1")
        );
    }

    #[test]
    fn navigation_is_limited_to_the_embedded_origin() {
        assert!(navigation_allowed(&format!("{SCHEME}://{HOST}/")));
        assert!(navigation_allowed(&format!(
            "{SCHEME}://{HOST}/assets/app.js"
        )));
        assert!(navigation_allowed(&format!(
            "http://{SCHEME}.{HOST}/index.html"
        )));
        assert!(navigation_allowed(&format!(
            "https://{SCHEME}.{HOST}/index.html"
        )));
        assert!(!navigation_allowed("https://example.com/"));
        assert!(!navigation_allowed("about:blank"));
        assert!(!navigation_allowed(&format!("{SCHEME}://evil/")));
    }
}
