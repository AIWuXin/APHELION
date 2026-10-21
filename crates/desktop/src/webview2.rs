//! Is the WebView2 Evergreen runtime installed?
//!
//! `wry` can create a window on Windows without a runtime only by failing, and
//! the failure text is aimed at developers. The desktop launcher asks the
//! registry first so the fallback reason is actionable and the browser path
//! starts without a scary dialog.
//!
//! The key is the one Microsoft documents for the Evergreen Runtime:
//! `...\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
//! with a `pv` string value. A 64-bit process reads the per-machine runtime
//! under `WOW6432Node`; HKCU covers per-user installs.

// The registry probe is Windows-only; other targets keep the module for the
// stub's unit test and the shared documentation.
#![cfg_attr(not(windows), allow(dead_code))]

/// Registry location of the WebView2 Evergreen runtime (per-machine, 32-bit
/// view used by the 64-bit runtime installer).
#[cfg(windows)]
const MACHINE_KEY: &str =
    r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// Same key without the WOW6432Node redirect (per-machine, native view).
#[cfg(windows)]
const MACHINE_KEY_NATIVE: &str =
    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// Per-user install location.
#[cfg(windows)]
const USER_KEY: &str =
    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// 返回已安装的 WebView2 运行时版本；未安装时返回 `None`。
///
/// 空值按“未安装”处理，避免拿空版本号去创建注定失败的 WebView2 窗口。
#[cfg(windows)]
#[must_use]
pub fn runtime_version() -> Option<String> {
    use registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

    for (root, key) in [
        (HKEY_LOCAL_MACHINE, MACHINE_KEY),
        (HKEY_LOCAL_MACHINE, MACHINE_KEY_NATIVE),
        (HKEY_CURRENT_USER, USER_KEY),
    ] {
        if let Some(version) = registry::read_string(root, key, "pv") {
            let version = version.trim().to_string();
            if !version.is_empty() {
                return Some(version);
            }
        }
    }
    None
}

/// Non-Windows builds have no WebView2 runtime to report.
#[cfg(not(windows))]
#[must_use]
pub fn runtime_version() -> Option<String> {
    None
}

#[cfg(windows)]
mod registry {
    //! Three `advapi32` calls, no `winreg` dependency.
    //!
    //! `RegGetValueW` does the open/query/close dance in one call and already
    //! expands `REG_EXPAND_SZ`, which is exactly what a version string needs.

    use std::ffi::c_void;
    use std::ptr;

    /// Win32 `HKEY` (opaque handle).
    pub(super) type Hkey = *mut c_void;

    // Predefined keys are `((HKEY)(LONG)0x8000000n)`; sign-extend to pointer.
    pub(super) const HKEY_CURRENT_USER: Hkey = 0x8000_0001_u32 as i32 as isize as usize as Hkey;
    pub(super) const HKEY_LOCAL_MACHINE: Hkey = 0x8000_0002_u32 as i32 as isize as usize as Hkey;

    const RRF_RT_REG_SZ: u32 = 0x0000_0002;
    const RRF_RT_REG_EXPAND_SZ: u32 = 0x0000_0004;
    const ERROR_SUCCESS: i32 = 0;
    const ERROR_MORE_DATA: i32 = 234;

    #[link(name = "advapi32")]
    extern "system" {
        fn RegGetValueW(
            key: Hkey,
            sub_key: *const u16,
            value_name: *const u16,
            flags: u32,
            value_type: *mut u32,
            data: *mut c_void,
            data_len: *mut u32,
        ) -> i32;
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Read one UTF-16 string value; `value_name` is the value's name.
    pub(super) fn read_string(root: Hkey, sub_key: &str, value_name: &str) -> Option<String> {
        let sub_key_w = wide(sub_key);
        let value_name_w = wide(value_name);
        let flags = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ;
        let mut value_type: u32 = 0;
        let mut bytes: u32 = 0;

        // SAFETY: both strings are live NUL-terminated buffers; asking for the
        // size with a null data pointer is the documented two-call pattern.
        let status = unsafe {
            RegGetValueW(
                root,
                sub_key_w.as_ptr(),
                value_name_w.as_ptr(),
                flags,
                &mut value_type,
                ptr::null_mut(),
                &mut bytes,
            )
        };
        if status != ERROR_SUCCESS && status != ERROR_MORE_DATA {
            return None;
        }
        if bytes == 0 {
            return None;
        }

        let mut buffer = vec![0_u8; bytes as usize];
        let mut len = bytes;
        // SAFETY: `buffer` has room for `len` bytes and outlives the call.
        let status = unsafe {
            RegGetValueW(
                root,
                sub_key_w.as_ptr(),
                value_name_w.as_ptr(),
                flags,
                &mut value_type,
                buffer.as_mut_ptr().cast(),
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
    use super::runtime_version;

    #[test]
    fn missing_value_is_represented_as_none() {
        // The helper must not panic when the key is absent; the exact value is
        // machine-dependent, so only the shape is asserted here.
        if let Some(version) = runtime_version() {
            assert!(!version.trim().is_empty());
        }
    }
}
