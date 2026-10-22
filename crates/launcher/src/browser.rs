//! Launch the default browser by spawning its executable directly.
//!
//! `cmd /c start "" <url>` (the original implementation) asks the shell to open
//! the URL. The shell forwards the request through the browser's
//! single-instance machinery, which compares integrity levels: with an
//! *elevated* Edge already running, the request produced by a shell of a
//! different level is refused and Edge shows the "existing instance is running
//! with elevated privileges, restart it with normal privileges?" dialog.
//! Spawning the browser's own executable keeps the child at the launcher's
//! integrity level, so an elevated launcher reaches the elevated instance at
//! the same level and the hand-off succeeds quietly.
//!
//! The registry is read through hand-written `advapi32` declarations: the
//! launcher is deliberately dependency-free (see `docs/decisions.md` D-09/D-12)
//! and two `RegQueryValueExW` calls do not justify adding `winreg`.

/// Open `url` in the user's default browser.
///
/// Returns `true` only when the browser process was spawned; `open_browser()`
/// in `lib.rs` falls back to `cmd /c start` otherwise. No `wait()`: the browser
/// is a GUI application and this launcher is fire-and-forget.
#[cfg(windows)]
pub fn spawn_default_browser(url: &str) -> bool {
    let Some(exe) = default_browser_exe() else {
        return false;
    };
    std::process::Command::new(exe).arg(url).spawn().is_ok()
}

/// Resolve the default browser's executable from the registry.
///
/// `UserChoice\ProgId` names the handler registered for `http` URLs, and
/// `HKCR\<ProgId>\shell\open\command` holds the command line Windows would run.
/// Returns `None` for anything that must be activated by the shell itself.
#[cfg(windows)]
fn default_browser_exe() -> Option<String> {
    use registry::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};

    const USER_CHOICE: &str =
        r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice";
    let prog_id = registry::read_string(HKEY_CURRENT_USER, USER_CHOICE, "ProgId")?;
    let command = registry::read_string(
        HKEY_CLASSES_ROOT,
        &format!(r"{prog_id}\shell\open\command"),
        "",
    )?;
    resolve_exe(&prog_id, &command)
}

/// Decide whether a `(ProgId, open command)` pair can be spawned directly.
///
/// `AppX…` ProgIds belong to Store/UWP apps: the shell activates those through
/// its own broker and the command line is a stub, not the app. Everything else
/// is a plain executable once the path is extracted.
fn resolve_exe(prog_id: &str, command: &str) -> Option<String> {
    if prog_id.is_empty() || prog_id.starts_with("AppX") {
        return None;
    }
    extract_exe_from_command(command)
}

/// Pull the executable path out of a `shell\open\command` template.
///
/// Windows writes either `"C:\...\msedge.exe" --single-argument %1` (quoted path
/// followed by arguments) or `C:\...\firefox.exe -osint -url "%1"` (bare path,
/// which ends at `.exe`). Templates that need the shell to finish the job —
/// `%ProgramFiles%` style expansion, launcher stubs — return `None` so the
/// caller takes the `cmd /c start` fallback.
fn extract_exe_from_command(template: &str) -> Option<String> {
    let template = template.trim();
    let path = if let Some(quoted) = template.strip_prefix('"') {
        let end = quoted.find('"')?;
        &quoted[..end]
    } else {
        // Byte indices stay valid: ASCII case folding never changes a length.
        let end = template.to_ascii_lowercase().find(".exe")? + ".exe".len();
        &template[..end]
    };
    let path = path.trim();
    if path.is_empty() || path.contains('%') || !path.to_ascii_lowercase().ends_with(".exe") {
        return None;
    }
    Some(path.to_string())
}

#[cfg(windows)]
mod registry {
    //! The two `advapi32` calls the launcher needs, nothing more.

    use std::ffi::c_void;
    use std::ptr;

    /// Win32 `HKEY` (opaque handle).
    type Hkey = *mut c_void;

    // Predefined keys are `((HKEY)(LONG)0x8000000n)` in the Windows headers, so
    // the 32-bit constant is sign-extended into the pointer on 64-bit builds.
    pub(super) const HKEY_CLASSES_ROOT: Hkey = 0x8000_0000_u32 as i32 as isize as usize as Hkey;
    pub(super) const HKEY_CURRENT_USER: Hkey = 0x8000_0001_u32 as i32 as isize as usize as Hkey;

    const KEY_READ: u32 = 0x0002_0019;
    const REG_SZ: u32 = 1;
    const REG_EXPAND_SZ: u32 = 2;
    const ERROR_SUCCESS: i32 = 0;
    const ERROR_MORE_DATA: i32 = 234;

    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            key: Hkey,
            sub_key: *const u16,
            options: u32,
            desired: u32,
            result: *mut Hkey,
        ) -> i32;
        fn RegQueryValueExW(
            key: Hkey,
            value_name: *const u16,
            reserved: *mut u32,
            value_type: *mut u32,
            data: *mut u8,
            data_len: *mut u32,
        ) -> i32;
        fn RegCloseKey(key: Hkey) -> i32;
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Read one string value; `value_name` is empty for the key's default value.
    pub fn read_string(root: Hkey, sub_key: &str, value_name: &str) -> Option<String> {
        let sub_key_w = wide(sub_key);
        let value_name_w = wide(value_name);
        let mut key: Hkey = ptr::null_mut();
        // SAFETY: `sub_key_w` is a live NUL-terminated UTF-16 buffer, `root` is a
        // predefined key from this module, and `key` is a valid out-parameter.
        let status = unsafe { RegOpenKeyExW(root, sub_key_w.as_ptr(), 0, KEY_READ, &mut key) };
        if status != ERROR_SUCCESS {
            return None;
        }
        let value = query_string(key, value_name_w.as_ptr());
        // SAFETY: the open above succeeded, so `key` is an owned handle that is
        // closed exactly once here.
        unsafe {
            RegCloseKey(key);
        }
        value
    }

    /// Two-call read: ask for the byte length, then fetch the value.
    fn query_string(key: Hkey, value_name: *const u16) -> Option<String> {
        let mut value_type: u32 = 0;
        let mut bytes: u32 = 0;
        // SAFETY: `key` is an open key; a null data pointer with a non-null
        // length pointer is the documented way to query the required size.
        let status = unsafe {
            RegQueryValueExW(
                key,
                value_name,
                ptr::null_mut(),
                &mut value_type,
                ptr::null_mut(),
                &mut bytes,
            )
        };
        if status != ERROR_SUCCESS && status != ERROR_MORE_DATA {
            return None;
        }
        if value_type != REG_SZ && value_type != REG_EXPAND_SZ {
            return None;
        }

        let mut buffer = vec![0_u8; bytes as usize];
        let mut len = bytes;
        // SAFETY: `buffer` has room for `len` bytes and outlives the call;
        // `value_type`/`value_name` are the same valid inputs as above.
        let status = unsafe {
            RegQueryValueExW(
                key,
                value_name,
                ptr::null_mut(),
                &mut value_type,
                buffer.as_mut_ptr(),
                &mut len,
            )
        };
        if status != ERROR_SUCCESS {
            return None;
        }
        buffer.truncate(len as usize);

        let units: Vec<u16> = buffer
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        Some(
            String::from_utf16_lossy(&units)
                .trim_end_matches('\0')
                .to_string(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_exe_from_command, resolve_exe};

    #[test]
    fn edge_template_yields_msedge() {
        let template = r#""C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --single-argument %1"#;
        assert_eq!(
            extract_exe_from_command(template).as_deref(),
            Some(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
        );
    }

    #[test]
    fn chrome_template_yields_chrome() {
        let template = r#""C:\Program Files\Google\Chrome\Application\chrome.exe" -- "%1""#;
        assert_eq!(
            extract_exe_from_command(template).as_deref(),
            Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        );
    }

    #[test]
    fn firefox_template_yields_firefox() {
        let template = r#""C:\Program Files\Mozilla Firefox\firefox.exe" -osint -url "%1""#;
        assert_eq!(
            extract_exe_from_command(template).as_deref(),
            Some(r"C:\Program Files\Mozilla Firefox\firefox.exe")
        );
    }

    #[test]
    fn unquoted_path_stops_at_exe() {
        let template = r#"C:\Program Files\Mozilla Firefox\firefox.exe -osint -url "%1""#;
        assert_eq!(
            extract_exe_from_command(template).as_deref(),
            Some(r"C:\Program Files\Mozilla Firefox\firefox.exe")
        );
    }

    #[test]
    fn trailing_whitespace_and_case_are_tolerated() {
        let template = "  \"C:\\Apps\\Browser.EXE\" %1  ";
        assert_eq!(
            extract_exe_from_command(template).as_deref(),
            Some(r"C:\Apps\Browser.EXE")
        );
    }

    #[test]
    fn appx_prog_id_is_not_spawnable() {
        let prog_id = "AppXq0fevzme2pys62n3e0fbqa7peapykr8v";
        let command = r#""C:\Windows\System32\LaunchWinApp.exe" %1"#;
        assert_eq!(resolve_exe(prog_id, command), None);
    }

    #[test]
    fn environment_variable_paths_are_not_spawnable() {
        let command = r#""%ProgramFiles%\Mozilla Firefox\firefox.exe" -osint -url "%1""#;
        assert_eq!(extract_exe_from_command(command), None);
    }

    #[test]
    fn malformed_templates_are_not_spawnable() {
        assert_eq!(extract_exe_from_command(""), None);
        assert_eq!(extract_exe_from_command("\"C:\\Apps\\no-close.exe"), None);
        assert_eq!(extract_exe_from_command(r#""C:\Apps\readme.txt" %1"#), None);
        assert_eq!(
            extract_exe_from_command("cmd /c start https://example.com"),
            None
        );
    }
}
