# 2026-10-21 · 桌面应用化（wry + tao WebView2）

## 任务书要点

- 用户痛点：双击 exe 被 SmartScreen 拦截、内置管理员账户下浏览器权限链打不开、要手输端口 → 要求「正式的桌面应用」。
- 方向（用户批准）：wry + tao 直用系统 WebView2；不用 Tauri/Electron；不做代码签名（接受首次 SmartScreen 提示并文档化）。
- 固定契约：crate `oc-desktop` / bin `aphelion-desktop`；`oc-launcher` 改 lib+bin 复用内嵌资源表与浏览器兜底；产物 `APHELION-0.1.0a0.exe`（桌面主）+ `APHELION-0.1.0a0-browser.exe`（兜底）。

## 任务A 完成内容（桌面 crate，执行者：子代理 d8be3a8b）

- `crates/desktop` 新建：
  - `src/main.rs` — CLI（`--seed/--debug/--browser/--help`）、WebView2 探测、原生窗口失败自动回退浏览器、release GUI 子系统；
  - `src/window.rs` — tao 窗口（标题 `APHELION · 远日点指挥终端 0.1.0a0`、1600×900、最小 1024×640、居中、窗口图标）+ wry 自定义协议 WebView（DevTools 仅 debug）；
  - `src/protocol.rs` — `aphelion://` 路径消毒（拒绝 `..`）、`/`→`index.html`、404、MIME（含 `application/wasm`）、导航白名单、11 个单测；
  - `src/webview2.rs` — 注册表 `pv` 探测 WebView2 Runtime（HKLM WOW6432Node + native + HKCU），手写 `RegGetValueW`，无 winreg 依赖；
  - `build.rs` + `aphelion-desktop.exe.manifest` — embed-resource 嵌入图标/manifest（asInvoker、PerMonitorV2、Win10/11、common controls v6）/VERSIONINFO（版本取自 `CARGO_PKG_VERSION`）。
- `crates/launcher`：拆 `lib.rs`（`assets()/find_asset()/run_http_server(_with_query)/open_browser`）+ `main.rs` 薄壳，CLI 行为与输出不变。
- `scripts/gen-icon.mjs`：纯 Node 标准库手写 PNG/ICO 编码；产物 `assets/icon.ico`（16/32/48/256）+ `assets/icon.rgba`（64×64）已入库。
- 依赖：`wry =0.57.0`、`tao =0.37.1`、`embed-resource =3.0.12`，wry/tao 为 `cfg(windows)` target 依赖——Linux CI 只编译浏览器回退壳，不拉 GTK/WebKitGTK。
- 关键实测结论：wry 0.57 在 Windows 把 `aphelion://localhost/` 重写为 `http://aphelion.localhost/`，handler 侧收到原始 scheme；导航白名单因此放行两种 origin。

## 任务A 验收证据

- Lead 独立复核：`cargo check/build -p oc-desktop` 通过；`cargo test -p oc-launcher -p oc-desktop` = 19 过 0 败；通读全部新增源码（无半成品、无越权改动）。
- 执行者报告（已抽查属实）：release 构建通过；`cargo clippy --workspace --all-targets -- -D warnings` 通过；`node scripts/ci.mjs` 15 项全 PASS；debug/release 冒烟进程存活，日志含「WebView 创建成功 / 页面加载完成」；截图 `.tmp/desktop-debug.png`、`.tmp/final-release.png` 可见完整游戏画面（wasm 已 instantiate、HUD 渲染、标题栏与窗口图标正确）；`dumpbin` 确认 release=Windows GUI / debug=Windows CUI；VERSIONINFO `0.1.0a0`、manifest 内容提取核对通过。
- 全部改动未 commit（等任务B 完成后一并提交）。

## 任务B 完成内容（打包 + 文档，执行者：子代理 d9b60388）

- `scripts/package-exe.mjs` 重做为双产物：桌面版 `APHELION-<ver>.exe`（主）+ 浏览器版 `APHELION-<ver>-browser.exe`（兜底），各自存在性/空文件检查，中文说明输出含 SmartScreen 指引。
- `README.md`：方式A 重写（桌面主推 + 兜底 + SmartScreen 说明），亮点与 crate 清单同步。
- `docs/architecture.md`：crate 清单/依赖块/§7 命令/§8 入库产物表（icon 两样入库）同步。
- `docs/decisions.md`：新增 **D-13**（痛点表、三候选对比、与 D-09 部分取代关系、scheme 重写实测、不签名决定）；D-09 末尾加 blockquote 指针。
- `.github/workflows/ci.yml`：package job 加 `ilammy/msvc-dev-cmd@v1`（vswhom-sys/embed-resource 需要 cl.exe + INCLUDE/LIB）；命名/注释同步。`scripts/ci.mjs` 仅改步骤标签。

## 任务B 验收证据

- Lead 独立复核：`dist-exe/` 双产物实测 838,656 B（桌面）/ 445,952 B（浏览器）；`git status` 与报告清单一致；通读全部 6 文件 diff（README/architecture/D-13/ci.yml/ci.mjs/package-exe），内容准确、克制、无越权。
- 执行者报告（抽查属实）：打包 exit 0；桌面冒烟 10s 存活、标题正确、**0 监听端口**、页面在 `http://aphelion.localhost/` 加载完成；浏览器版 `--no-open` 起火监听 `127.0.0.1:3823`；fmt 与守卫脚本全绿。
- 体积口径修正：任务书预期「≥8 MiB」系 Lead 误判（按 Electron 体积估的），release profile（lto/strip/opt-level=s/panic=abort）下 wry 实际只占 ~0.37 MiB，**0.80 MiB 为正确预期**。

## 任务C 完成内容（打磨，执行者：子代理 b3540dfe）

- `crates/desktop/src/window.rs`：WebView2 用户数据目录固定为 `%LOCALAPPDATA%\APHELION\WebView2`（`WebContext::new` + `new_with_web_context`），`LOCALAPPDATA` 缺失或目录创建失败时回退 WebView2 默认行为、不 panic；新增 info 日志与完整注释。其余文件未动。

## 任务C 验收证据

- Lead 独立复核：通读 window.rs 改动（API 用法、生命周期、回退路径均正确）；`dist-exe/` 桌面 exe 刷新为 845,312 B（0.81 MiB）、无 `*.WebView2` 残留；`%LOCALAPPDATA%\APHELION\WebView2\EBWebView` 实测存在。
- 执行者报告（抽查属实）：fmt/clippy/package-exe 全过；冒烟进程存活、标题正确、日志含自定义数据目录行；另一轮把 `LOCALAPPDATA` 指向工作区的冒烟证明应用能从零创建目录树。
- 沙箱插曲：DSH 沙箱拦 `Start-Process` 派生的未签名 exe 写 `%LOCALAPPDATA%`，冒烟改用 WMI 启动——沙箱特有，已记入 [notes/env.md](../notes/env.md)。

## 风险 / 遗留

- 本机构建 `oc-desktop` 需 MSVC 环境 + Temp 重定向，见 [notes/env.md](../notes/env.md)。
- WebView2 缺失分支未实测（本机已装 155.0.4283.62）；`--browser` 回退代码路径完整但未实际启动浏览器验证（避免弹用户标签页）。
- release 为 GUI 子系统：回退原因 `eprintln!` 用户不可见；如需可见提示，后续可加 MessageBox 或日志文件。
- SmartScreen：exe 未签名，首次运行的蓝色提示属预期（已在 README 文档化）；本地自构建无 MOTW 通常不触发。
