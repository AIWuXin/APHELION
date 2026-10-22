//! Windows console niceties for the launcher.
//!
//! A default Windows console runs code page 936/437, which renders the Chinese
//! banner as mojibake. Switch the console to UTF-8 and give the window a title.
//! Both calls are harmless when stdout is redirected or there is no console at
//! all, and the whole module compiles to nothing on other platforms.

/// Set the console code page to UTF-8 and title the window.
pub fn prepare() {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        extern "system" {
            fn SetConsoleOutputCP(code_page: u32) -> i32;
            fn SetConsoleCP(code_page: u32) -> i32;
            fn SetConsoleTitleW(title: *const u16) -> i32;
        }

        const UTF8_CODE_PAGE: u32 = 65001;
        let title: Vec<u16> = OsStr::new("APHELION 0.1.0a1")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        // SAFETY: plain Win32 calls; `title` is a NUL terminated live buffer and
        // the code page constants are valid.
        unsafe {
            SetConsoleOutputCP(UTF8_CODE_PAGE);
            SetConsoleCP(UTF8_CODE_PAGE);
            SetConsoleTitleW(title.as_ptr());
        }
    }
}
