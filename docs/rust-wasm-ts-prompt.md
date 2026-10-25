# Rust 计算 + TS 渲染：分层架构提示词

> **历史参考（旧版）**：架构讨论保留，旧版视觉约束不再作为现行美术规范。当前以
> [现代航天工程图谱](superpowers/specs/2026-10-24-aerospace-visual-redesign-design.md) 与 [design.md](design.md) 为准。

> 问题：渲染用 TS 前端技术、计算用 Rust，可行吗？
> 结论：**可行且是正确的长期分工**。但先要分清是两种形态：
> **A. 浏览器内 WASM 内核**（无服务器，单机/本地对战）
> **B. 真正的服务端**（Rust 权威仿真，TS 客户端渲染，联机/反作弊）
> 最优做法：**同一个 `crates/sim` 两用**——先以 WASM 形态跑单机，后面加 `crates/server`，协议与业务代码不变。

---

## 一、三种形态对比

| 形态 | 计算 | 渲染 | 适合 | 代价 |
|---|---|---|---|---|
| 纯 TS（上一版） | TS | TS | 快速验证、单机 demo | 后期大世界/多人要重写核心 |
| **A. Rust→WASM + TS**（推荐起步） | Rust 编 wasm，跑在 Web Worker | TS Canvas + DOM HUD | 单机、本地多人、可复现回放 | 工具链与调试成本；wasm 体积 |
| **B. Rust 服务端 + TS**（联机时加） | Rust 服务端 30Hz 权威仿真 | TS 客户端渲染快照 | 多人对战、反作弊、长线运营 | 服务器成本、延迟处理、运维 |

关键：**A 和 B 共用同一个 `sim` / `protocol` / `content` crate**，切换只是换 Transport 实现。

---

## 二、架构图

```text
┌───────────────────────────── browser ─────────────────────────────┐
│  main thread                       Web Worker                     │
│  ┌────────────┐  commands   ┌──────────────────────┐              │
│  │ input/ui   │ ──────────▶ │ wasm bridge          │              │
│  │ (TS)       │             │ crates/sim + protocol │              │
│  └────────────┘ ◀────────── └──────────────────────┘              │
│        │        snapshots(bincode)         │                       │
│        ▼                                   │ 同 crate（可选）       │
│  ┌────────────┐                            ▼                       │
│  │ renderer   │                     ┌─────────────┐                │
│  │ (TS Canvas)│                     │ crates/server│──▶ WebSocket  │
│  └────────────┘                     │ axum + tokio │    (形态 B)   │
└─────────────────────────────────────┴─────────────┴───────────────┘
```

**边界只有一个**：`Command[]` 进，`Snapshot` 出（二进制）。渲染、HUD、输入、网络都在这条边界之外。

---

## 三、分层提示词（直接粘贴）

```text
项目采用「Rust 计算 + TS 表现」的分层架构：Rust 负责全部游戏规则与仿真（crates/sim），TS 只负责渲染与 HUD，两者只通过"命令队列 + 只读快照"的二进制边界通信。先实现浏览器内 WASM 形态（Web Worker），架构上预留同协议的服务端形态（crates/server），切换时业务代码不改。

【仓库结构】
repo/
├─ Cargo.toml                  # workspace
├─ crates/
│  ├─ iso/                     # 纯等距数学，无依赖，100% 单测
│  ├─ content/                 # 建筑/单位/航线数据表（serde + 启动校验）
│  ├─ protocol/                # Command / Snapshot / Event + 版本 + ts-rs 导出
│  ├─ sim/                     # 确定性仿真，无 I/O、无 DOM、无网络
│  ├─ bridge-wasm/             # wasm-bindgen 薄桥（只导出 4 个函数）
│  └─ server/                  # （可选，形态 B）axum + tokio + WebSocket
├─ web/
│  ├─ src/render/              # Canvas2D 渲染（地形/精灵/相机/插值）
│  ├─ src/ui/                  # DOM HUD（沿用既定 tokens 与版式）
│  ├─ src/net/                 # Transport 接口 + WasmTransport / WebSocketTransport
│  └─ src/generated/           # ts-rs 生成的协议类型（禁止手写）
└─ tests/                      # 确定性哈希、协议 roundtrip、e2e 冒烟

【Rust 侧铁律】
1) crates/sim 纯仿真：无 I/O、无 DOM、无全局可变状态；入口统一
   fn step(state: &mut SimState, commands: &[Command], tick: u64) -> FrameOutput;
   固定步长 1/30s；不 panic（用 Result/Option 表达非法状态）。
2) 确定性：RNG 分流域（terrain / battle / economy 各一个 mulberry32）；仿真数学只用整数或受限浮点（+ - * / sqrt）；禁止 HashMap 迭代顺序影响结果（用 BTreeMap 或显式排序索引）；禁止时间/环境依赖；目标：同 seed + 同命令序列 → 状态哈希一致。
3) crates/protocol：Command 与 Snapshot 全部 serde；带 protocol_version；用 ts-rs 生成 TS 类型到 web/src/generated/，CI 校验生成物无 diff（禁止手写重复类型）；快照用 SoA / 紧凑结构，禁止嵌套字符串与 map。
4) crates/content：数据表用 serde 反序列化 + 启动时校验（id 唯一、引用存在、数值范围合法、footprint 合法）；新增建筑只加一条记录 + TS 侧注册一个绘制函数。
5) crates/bridge-wasm：只导出 init(seed, content_json) / enqueue_commands(bytes) / tick() -> snapshot_bytes / state_hash()；不得暴露内部结构；wasm-bindgen 返回值优先 TypedArray 视图（零拷贝），做不到时明确标注拷贝成本。
6) crates/server（可选）：axum + tokio + WebSocket，复用 sim/protocol/content；30Hz tick，按房间（房间=星区战场）分任务；每 tick 广播全量快照（v1），后续可改增量；重连发全量快照；命令带 client_seq 与服务器 ack。
7) 禁止：sim 依赖 wasm/网络/文件系统；bridge 里写规则；Rust 端生成 DOM 或调用 JS 回调参与仿真。

【协议】
- 序列化 bincode 或 postcard；WebSocket 用 binary frame；禁止每 tick JSON。
- 方向 A→R：Command[]（含 client_seq）；R→A：Snapshot（protocol、tick、hash、resources、实体数组、事件列表）。
- HUD 展示数据由客户端从 Snapshot 派生；若 HUD 需要聚合值（如"航线吞吐"），在 protocol 里加只读 HudSnapshot 字段，规则仍留在 Rust。
- 版本握手：protocol 版本不一致直接拒绝并提示刷新/升级，禁止静默降级。

【TS 侧铁律】
- web/src/render：Canvas2D，只读 Snapshot；渲染 60fps、仿真 30Hz；保存最近 2 帧快照做位置/进度插值（避免抖动）；相机、地形分块缓存、精灵缓存沿用既定方案。
- web/src/ui：DOM HUD，只吃 HudSnapshot；不 import sim/world 概念、不做规则计算（可做纯展示格式化）。
- web/src/net：Transport 接口 { start(); send(Command[]); onSnapshot(cb); close(); }；实现 WasmTransport（Worker + wasm）与 WebSocketTransport；上层不感知差异。
- WASM 必须在 Web Worker 内运行：主线程只做渲染、输入、HUD；跨线程消息只传 ArrayBuffer（transferable），零拷贝。
- 输入：本地命令队列 → 下一仿真 tick 发送；v1 不做客户端预测；HUD 显示连接状态与延迟。
- 禁止：TS 里复制游戏规则；TS 直接读写 Rust 内存；每帧 JSON 解析；在主线程跑 sim。

【性能预算】
- sim tick ≤ 2ms（1000 实体 + 50 建筑基准）；wasm↔JS 边界 ≤ 0.5ms/帧；快照 ≤ 64KB/tick（v1 全量）。
- wasm 体积 gzip ≤ 1.5MB（wasm-opt -O3）；超预算需给出原因与拆分方案。
- 渲染 60fps；HUD 脏检查，不做全量重绘。

【测试】
- cargo fmt --check、cargo clippy -- -D warnings、cargo test。
- Rust：iso 数学、放置校验、经济/物流/战斗结算、同 seed 600 tick 状态哈希、协议 roundtrip、content 表校验。
- wasm-bindgen-test：bridge 的 init/enqueue/tick 正确性。
- TS：vitest 测 Transport 抽象、插值、HudModel 派生；Playwright 截图冒烟（HUD 版式 + 一帧地图）。
- CI：以上全绿 + ts-rs 生成物 diff 校验 + wasm 体积检查 + pnpm typecheck/lint/build。

【交付阶段（每阶段可运行 + 可截图 + CI 全绿）】
P0：workspace + content + protocol + sim 空实现 + ts-rs + CI，无渲染，CLI 能跑 1 tick。
P1：sim 五系统（经济/建造/发射/物流/战斗）+ 单测 + 确定性哈希；headless CLI 跑 1000 tick 输出快照摘要。
P2：bridge-wasm + Worker + Transport + Canvas 渲染（地形/建筑/单位）+ 静态 HUD，浏览器跑通。
P3：交互闭环（建造/发射/物流/战斗/调试台）+ 插值 + 性能达标。
P4（可选）：crates/server + WebSocketTransport + 双端联机冒烟 + 断线重连。

【验收 / 维护性检查】
- 同一 seed + 同一命令序列：headless CLI 与浏览器 WASM 的状态哈希一致。
- grep 检查：sim 无 wasm/网络/DOM 依赖；TS 无游戏规则副本；协议类型全部来自 ts-rs。
- 新增建筑：content 表一条 + TS 渲染注册一处，协议零改动；新增资源：content/balance 改动，系统改动 ≤ 2 处。
- 60fps 渲染、30Hz 仿真、插值平滑；重连与版本不匹配有明确 UI 提示（若做 P4）。
- README 写明：边界协议、确定性约束、如何从 WASM 形态切到服务端形态。
```

---

## 四、协议示例（Rust）

```rust
// crates/protocol/src/lib.rs
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PROTOCOL_VERSION: u16 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../web/src/generated/")]
#[serde(tag = "k", rename_all = "snake_case")]
pub enum Command {
    PlaceBuilding { building: BuildingId, gx: i16, gy: i16 },
    Demolish { entity: u32 },
    Launch { pad: u32 },
    ToggleRoute { route: RouteId, enabled: bool },
    SetSpeed { speed: u8 },
    Pause,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../web/src/generated/")]
pub struct Snapshot {
    pub protocol: u16,
    pub tick: u64,
    pub hash: u64,
    pub resources: [i64; 4],
    pub entities: Vec<EntitySnap>,
    pub events: Vec<EventSnap>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../web/src/generated/")]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum EntitySnap {
    Building { id: u32, kind: BuildingId, gx: i16, gy: i16, hp: u16, progress: u16 },
    Unit { id: u32, kind: UnitId, x: i32, y: i32, facing: u8, hp: u16 },
}
```

```rust
// crates/bridge-wasm/src/lib.rs
#[wasm_bindgen]
pub fn init(seed: u64, content_json: &str) -> Result<(), JsValue>;
#[wasm_bindgen]
pub fn enqueue_commands(bytes: &[u8]) -> Result<(), JsValue>; // bincode Vec<Command>
#[wasm_bindgen]
pub fn tick() -> Result<Vec<u8>, JsValue>;                       // bincode Snapshot
#[wasm_bindgen]
pub fn state_hash() -> u64;
```

## 五、TS 侧边界（接口固定，实现可换）

```ts
export interface Transport {
  start(): Promise<void>;
  send(commands: readonly Command[]): void;
  onSnapshot(cb: (snap: Snapshot) => void): () => void;
  close(): void;
}

// wasm 形态：Worker 内 postMessage；server 形态：WebSocket binary frame
export type TransportKind = "wasm-worker" | "websocket";
```

渲染层只依赖 `Snapshot`；HUD 只依赖 `HudSnapshot`。**切换形态 = 换一个 Transport 实现，业务代码零改动。**

---

## 六、三个必须提前想清楚的坑

1. **浮点确定性**：WASM 与原生 x86 的浮点结果可能不同。若要求"客户端与服务端哈希一致"：
   - 方案 A：仿真内**只用定点数**（如 i32，1/1024 精度），自己实现乘除与 sqrt 取整；
   - 方案 B：只让**服务端唯一权威**跑 sim，客户端 WASM 仅在单机模式用，联机模式客户端只渲染；
   - 方案 C：接受同平台一致（回归测试在固定 CI 镜像跑），联机不做客户端校验。
   建议默认 C，需要回放/反作弊校验时上 A。
2. **每 tick JSON**：30Hz × 1000 实体，JSON 解析会吃掉后端一半预算。必须 bincode/MessagePack 二进制。
3. **规则漂移**：TS 里再写一份"物流速率/造价"就会双份真相。所有规则只在 Rust content/sim；TS 只做展示格式化。用 ts-rs 生成类型，杜绝手写协议。

## 七、部署（形态 B）

- 单二进制（server）+ 静态资源（web 构建产物）；房间制分片，按 match id 路由。
- 观测：每 tick 耗时直方图、快照大小、连接数、掉线率；异常快照可 dump 复盘。
- 版本：前端与协议版本握手；灰度时保留上一版协议反序列化。
- 反作弊天然成立：客户端只发命令，服务端校验（资源、冷却、位置合法性）。
