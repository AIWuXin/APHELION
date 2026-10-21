# 项目勘察与档案建立（2026-10-21）

## 做了什么

新会话首次只读勘察：`docs/architecture.md`、`docs/decisions.md`（20+ 条取舍）、`docs/design.md`、`README.md`、目录结构（`crates/*`、`web/src/*`、`scripts/*`）、`git log` / `git status`。

## 结论

- 项目为 APHELION `0.1.0a0`：等距科幻殖民地建造 + 舰队防御，Rust 确定性内核 → WASM，TS 表现层（Canvas 世界 + DOM HUD），零运行时依赖。
- 工程体系完整：确定性守卫（sim-cli 双跑哈希）、postcard 二进制协议 + 跨语言 fixtures、ts-rs 类型生成、入库 wasm + generated 的三 job CI、单文件 exe 打包链。
- git 工作树干净；最近 8 个提交全部是 CI 加固（wasm 行为哈希门禁 D-11、钉 Rust 1.96.0）与 launcher 修复（D-12 直接 spawn 默认浏览器）。无进行中工作的迹象。

## 验证证据

- `git log --oneline -8`：HEAD = `259b256 fix(launcher): spawn default browser directly…`
- `git status --short`：无输出（干净）

## 产出

- 建立进展档案骨架：本索引 + `milestones/` + `tasks/` + `notes/`，环境笔记见 [../notes/env.md](../notes/env.md)。
