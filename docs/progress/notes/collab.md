# 协作纪律（用户指令，2026-10-22 起生效）

**分工铁律（2026-10-22 用户定稿）：大部分情况委派子 agent 执行；少数 Lead 判断子 agent 做不好的活，Lead 亲自做。**（「旧世界」危机期间的「你自己来吧」是临时处置，不覆盖默认分工。）

**「子agent执行时间每次都太长了，让它们不要过度思考。」**

对所有 subagent 任务书的强制要求：

1. **先测量后动刀**：性能/排查类任务必须先跑基准或复现，再改；禁止凭推测重构。
2. **最小必要范围**：只做任务书点名的部分；发现的额外问题记入「遗留」，不顺手改。
3. **禁止过度设计**：不抽象、不泛化、不加可配置项，除非任务书要求；能删代码解决就不加代码。
4. **时间盒**：探索性阅读控制在定位问题所需最小集；单轮执行卡住超过 ~20 分钟就报告现状而不是继续挖。
5. **报告从简**：结论先行、证据给数字、不贴大段代码日志。

Lead 侧：任务书必须写清「不做什么」，验收时检查范围蔓延。

## 交付验收补充（2026-10-22，旧 exe 事故后）

事故：用户误开昨天的 `target\debug\aphelion-desktop.exe`（44×44 旧世界）以为是新交付；界面无构建标识导致无法当场分辨。教训固化为两条验收纪律：

1. **exe 交付必须实跑验收**：时间戳/文件大小不算证据。用 `dist-exe\*-browser.exe --port <p> --no-open`（重定向日志到 .tmp）+ playwright 探针截图，确认画面与调试行（PROTO/世界尺寸/CHUNK 计数）符合当次改动，再向用户宣布交付。一次性探针模式见 `.tmp/shot-exe.mjs`（可提升为 scripts/ 正式工具）。
2. **每个构建必须可辨识**：构建时间戳进窗口标题与游戏内状态栏（已完成）。

## 构建时间戳（2026-10-22 完成）

- 三处可见：桌面窗口标题 `APHELION · 远日点指挥终端 0.1.0a0 · 1022-1159`、游戏状态栏 SEED 右侧同款紧凑戳、浏览器 tab 标题；VERSIONINFO Comments 存完整戳（`build 2026-10-22 11:59 local`）。
- 实现：`crates/desktop/build.rs` `local_stamp()`（powershell Get-Date，失败回退 UTC 并在 Comments 标注）；`vite.config.ts` define `__OC_BUILD_STAMP__`（本地 getMonth/…）；`web/src/ui/panels/subtitle.ts` 状态栏 span；`web/src/main.ts` document.title。
- 刷新策略：desktop build.rs 的 rerun-if-changed 追加 `src` 与 `dist/`——戳随「代码或内嵌前端变化」刷新，exe 戳与状态栏戳天然一致。
- 实跑验证：browser exe 服务口 + playwright 探针，戳与本机时钟同分钟；证据 `.tmp/stamp-proof-local.png`；CI 15/15。
- 已知取舍：oc-launcher crate 无 VERSIONINFO 戳（无 build.rs），浏览器版标识只靠内嵌状态栏戳。
