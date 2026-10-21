# 进展档案 · APHELION

agent 自己的工作档案：只写结论、文件路径、验证证据、风险。新会话只读本索引即可接续工作。
`docs/` 根部的 design / architecture / decisions 是面向读者的产品文档，与本档案互不替代。

## 当前状态

- 项目：APHELION · 远日点指挥终端 `0.1.0a0`。Rust 确定性仿真内核（WASM）+ TS 表现层；分发形态：WebView2 原生桌面窗口（主，`aphelion-desktop`）+ 单文件浏览器启动器（兜底，`aphelion`）。
- 阶段：**游戏重新设计 · 迭代1（T1 基础内容）完成**。桌面应用化此前完成；本轮按用户愿景重做母星阶段：煤资源/采煤机/火电站、光伏低火电高、era/tier 建造门槛（T1 仅 6 卡）、T1 纯地面掠袭、前端煤 HUD/煤层渲染。完整 `node scripts/ci.mjs` 15 步 PASS，dist-exe 已重打包。全部改动未 commit（桌面应用化 + 迭代1 两批）。
- 下一步：用户双击实测 `dist-exe/APHELION-0.1.0a0.exe`（重点：开局金属+煤双腿节奏、火电补电手感、地面掠袭压力）→ 反馈后 commit，再设计 T1 剩余与 T2。

## 最近更新

- 2026-10-21 · [中枢 3×3 + 中枢/精炼厂画法重做](tasks/2026-10-21-hub-3x3-landmarks.md)
- 2026-10-21 · [游戏重新设计（愿景/资源定案/迭代1 T1 已完成待实测）](tasks/2026-10-21-game-redesign.md)
- 2026-10-21 · [桌面应用化（wry + tao WebView2）](tasks/2026-10-21-desktop-wry.md)
- 2026-10-21 · [项目勘察与档案建立](milestones/2026-10-21-project-survey.md)

## 待办 / 风险

- 构建 `oc-desktop` 有 MSVC 环境前置（vcvars + Temp 重定向），见 [notes/env.md](notes/env.md)。
- 改动 `crates/sim` 或 `crates/protocol` 后，必须跑 `pnpm run wasm` + `cargo test` 并提交 `web/public/oc.wasm` 与 `web/src/generated/`，否则 web CI 用旧内核（产品文档：`docs/architecture.md §8`）。
- 系统执行顺序属于确定性契约，改动需记入 `docs/decisions.md` 并知会：旧回放失效。

## 目录

- `milestones/` — 阶段成果
- `tasks/` — 单任务记录（任务书要点 + 验收证据）
- `notes/` — 环境与踩坑
