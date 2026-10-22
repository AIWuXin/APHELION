# 进展档案 · APHELION

agent 自己的工作档案：只写结论、文件路径、验证证据、风险。新会话只读本索引即可接续工作。
`docs/` 根部的 design / architecture / decisions 是面向读者的产品文档，与本档案互不替代。

## 当前状态

- 项目：APHELION · 远日点 `0.1.0a1`。Rust 确定性仿真内核（WASM）+ TS 表现层；分发形态：WebView2 原生桌面窗口（主，`aphelion-desktop`）+ 单文件浏览器启动器（兜底，`aphelion`）。
- 阶段：**0.1.0a1 已发布**（2026-10-22）：行星级世界 + 大陆出生点 + 深水美术 + 改名「远日点」；commit/push/tag `v0.1.0a1`/GitHub Release（双 exe）完成。
- 下一步：T1 剩余打磨与 T2（石油/化工）设计；迭代2候选：era1 隐藏未解锁面板、REASON_* 中文表、事件日志去重。

## 最近更新

- 2026-10-22 · [发版 0.1.0a1：改名「远日点」+ 提交/推送/tag/Release](tasks/2026-10-22-release-a1.md)
- 2026-10-22 · [出生点大陆保证：八向内陆射线，家选拆入 mapgen/home.rs](tasks/2026-10-22-continent-home.md)
- 2026-10-22 · ["还是旧世界"危机侦破：条纹=海洋，exe 无问题；暴露出生点临海问题](tasks/2026-10-22-stale-world-crisis.md)
- 2026-10-22 · [内核性能：区块生成 −38~49%，平移占位帧清零](tasks/2026-10-22-kernel-perf.md)
- 2026-10-22 · [行星级世界：环面 + 区块流送 + 气候地貌（完成待实测）](tasks/2026-10-21-planet-scale.md)
- 2026-10-21 · [中枢 3×3 + 中枢/精炼厂画法重做](tasks/2026-10-21-hub-3x3-landmarks.md)
- 2026-10-21 · [游戏重新设计（愿景/资源定案/迭代1 T1 已完成待实测）](tasks/2026-10-21-game-redesign.md)
- 2026-10-21 · [桌面应用化（wry + tao WebView2）](tasks/2026-10-21-desktop-wry.md)
- 2026-10-21 · [项目勘察与档案建立](milestones/2026-10-21-project-survey.md)

## 待办 / 风险

- 构建 `oc-desktop` 有 MSVC 环境前置（vcvars + Temp 重定向），见 [notes/env.md](notes/env.md)。
- 改动 `crates/sim` 或 `crates/protocol` 后，必须跑 `pnpm run wasm` + `cargo test` 并提交 `web/public/oc.wasm` 与 `web/src/generated/`，否则 web CI 用旧内核（产品文档：`docs/architecture.md §8`）。
- **子agent 任务书纪律（用户指令 2026-10-22）：禁止过度思考——先测量后动刀、最小范围、不过度设计、20 分钟时间盒、报告从简，见 [notes/collab.md](notes/collab.md)。**
- 系统执行顺序属于确定性契约，改动需记入 `docs/decisions.md` 并知会：旧回放失效。

## 目录

- `milestones/` — 阶段成果
- `tasks/` — 单任务记录（任务书要点 + 验收证据）
- `notes/` — 环境与踩坑
