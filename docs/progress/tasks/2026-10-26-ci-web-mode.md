# 2026-10-26 · CI `--web` 模式与工具链文档

## 范围

修正已记录的工程不一致，不改变游戏代码、协议或 CI 的各检查项本身。

## 完成

- `scripts/ci.mjs` 的 exe 打包移出 `!onlyRust` 分支，只在未指定 `--web` / `--rust` 的完整运行中执行。
- `--web` 现在与 README、脚本注释一致，只运行 typecheck、ESLint、Vitest、Vite build 和三项前端守卫，不再重建 WASM 或 exe。
- 默认 `node scripts/ci.mjs` 与 `--rust` 行为保持原意；完整命令仍在最后打包两个 exe。
- README 的 Rust 要求从过时的 1.80+ 改为 `rust-toolchain.toml` 固定的 1.96.0。

## 验证

- 普通 shell（无 vcvars）运行 `node scripts/ci.mjs --web`：7 个前端阶段全绿，13 个测试文件共 56 项测试通过，日志无 Rust/WASM/exe 阶段，总耗时约 10 秒。
- `vcvars64` 环境运行完整 `node scripts/ci.mjs`：15 阶段全绿，最后的桌面版与浏览器兜底版均打包成功。

## 接续

纯前端迭代可直接使用 `node scripts/ci.mjs --web`；涉及内核、协议或交付产物时继续运行完整命令。本文与代码未提交。
