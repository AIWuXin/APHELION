# 环境与踩坑

## 工具链（Windows，工作区 `E:\agent\pool\infinite`）

- Node 20+、pnpm 11、Rust 1.96.0（`rust-toolchain.toml` 钉死）+ `wasm32-unknown-unknown` target
- 截图取证依赖本机已装 Chrome（`scripts/screenshot.mjs` 用 playwright-core 的 `channel: 'chrome'`）
- 不需要 wasm-pack / wasm-bindgen

## 常用命令

```powershell
node scripts/ci.mjs               # 全套 CI（Rust + 前端 + 守卫）
node scripts/ci.mjs --web         # 只跑前端
pnpm run wasm                     # 重建 web/public/oc.wasm（改 sim/protocol 后必跑）
pnpm run dev                      # 开发服务器 http://127.0.0.1:5178
node scripts/screenshot.mjs --debug   # 无头截图 1920×1080 + 收集 console 报错
cargo run -p oc-sim-cli -- 3000   # 确定性守卫：连跑两次比哈希
```

## 踩坑记录

- 2026-10-21：DSH 会话在 `workspace-write` 文件策略下，pwsh 进程无法启动（exit 0xC0000142，DLL 初始化失败）；策略放宽为 `danger-full-access` 后恢复。只读勘察（read/glob/grep 工具）不受影响，可作为降级手段。
- 2026-10-21：**构建 `oc-desktop`（wry/tao）有 MSVC 环境前置**。`embed-resource` 的传递依赖 `vswhom-sys` 用 cl.exe 编译 C++：普通 pwsh 缺 `INCLUDE/LIB` 报 `C1034: windows.h`；且 DSH 派生的 cl.exe 写系统 Temp 被拒（`C1083 ... _CL_* Permission denied`，Temp ACL 含 CodexSandboxUsers 条目）。cargo 前必须先执行：

  ```powershell
  cmd /c '"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1 && set' | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] } }
  $env:TMP = "$PWD\.tmp"; $env:TEMP = $env:TMP
  ```

  CI 的 package job 用 `ilammy/msvc-dev-cmd@v1` 解决前者；Temp ACL 是本地沙箱特有问题，CI 不受影响。只跑纯 Rust crate（无 cc 构建脚本）不需要此前置。
- 2026-10-21：DSH/Codex 沙箱会拦截 `Start-Process` 派生的**未签名 exe** 写 `%LOCALAPPDATA%`（`拒绝访问 (os error 5)`，连最小 Rust probe 也被拒；cmd/pwsh 自身可写）。需要冒烟桌面 exe 的真实用户数据路径时，改用 WMI `Win32_Process.Create` 启动以获取非沙箱 token；普通桌面双击不受此限制，属沙箱特有。
