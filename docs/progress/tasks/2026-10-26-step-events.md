# 2026-10-26 · 宿主 step 快照事件保留（D-19）

## 范围

修复 `rush` / 多倍速下命令与非末尾子 tick 事件丢失。保持系统执行顺序、协议二进制布局和 `PROTOCOL_VERSION = 2` 不变。

## 根因与复现

- `World::step()` 先应用命令，而 `advance()` 在每个子 tick 开头执行 `events.clear()`。即时建造等命令事件因此在编码前必被清除；2×/4× 下也只有末尾子 tick 的事件能进入快照。
- 新增 `crates/sim/tests/events.rs`，先在旧实现取得两条红灯：即时建造事件缺失；4× 首子 tick 应有 `DROPS_BASE = 2` 条掠袭事件，实际为 0。

## 修复

- `events.clear()` 移到宿主 `step()` 开始、应用命令之前；一次快照聚合本步命令与 1–4 个 tick 的事件，下一 step 清空。`MAX_EVENTS = 64` 与 HUD 六条环形日志不变。
- `Snapshot.events` 文档明确为宿主 step 语义；`docs/architecture.md` 与 `docs/decisions.md` D-19 已同步。
- 事件参与哈希，有事件帧的哈希与旧版不同；同种子同命令双跑确定性不变，无事件 idle 哈希不变。
- `web/public/oc.wasm` 是本次真实内核变更产物，必须保留；`web/src/generated/Snapshot.ts` 注释由 `ts-rs` 同步。

## 验证

- 两条新 Rust 测试转绿：命令事件到达快照；4× 首子 tick 双掠袭完整保留，下一 step 不重放。
- 完整 `node scripts/ci.mjs` 15 阶段全绿：Rust fmt/clippy/test、3000 tick 确定性、原生/WASM 哈希、56 项前端测试、全部守卫、WASM 与两个 exe 构建。
- 3000 tick 脚本双跑哈希均为 `0xf95a59fa`；原生与 WASM idle300 均为 `0x7c540e6f`。
- `node scripts/screenshot.mjs --demo --rush --debug --wait 52000 --out .tmp/rush-events-fixed.png --stats` 控制台零错误。02:15 两条地面掠袭、01:55 波次预警和 00:56 研究完成同时出现在日志，覆盖此前的 `rush` 失效场景。

## 接续

- 本项已关闭，不再把 `rush` 无日志列为待办；暂停/后台交付时序由 [D-20 后续任务](2026-10-26-paused-events.md) 补齐。
- T1 平衡实测与 T2 石油/化工设计仍是玩法下一步。
- 代码、生成物与本文档未提交；原有未跟踪 `dungeon-village-prompt.md` 未触碰。
