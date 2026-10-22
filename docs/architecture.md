# 架构 / Architecture

面向新人的操作手册：**10 分钟内知道怎么加一个建筑、怎么换 Transport、依赖为什么这样切。**

---

## 1. 目录与依赖方向

```
crates/
  iso/         纯数学：定点、网格、2:1 投影、确定性多流域 RNG           ← 无依赖
  content/     数据表：建筑/单位/航线/科技/事件/地形/数值 + catalog()   ← iso? 否，仅 protocol
  protocol/    协议：Command / Snapshot / BootBlob / Catalog / ts-rs 导出 ← 无依赖
  sim/         确定性仿真：World + systems/*（无 I/O、无 DOM、无时钟）   ← iso, content, protocol
  sim-cli/     headless 跑 3000 tick 并打印哈希（CI 的确定性守卫）        ← sim
  bridge-wasm/ 薄桥：18 个 extern "C" 函数，crate-type = cdylib          ← sim, protocol
  launcher/   单文件 exe（兼 lib）：内嵌 dist/ + 最小 HTTP 服务 + 开浏览器 ← protocol
  desktop/    原生窗口：tao + wry/WebView2，自建 aphelion:// 协议   ← launcher, protocol（wry/tao 仅 Windows）
web/src/
  style/       tokens.ts（唯一色板/字号/几何真源）+ inject-theme.ts
  net/         Transport 契约、postcard reader/writer、decode、encode
  app/         store / input / loop / app（单向数据流的编排者）
  render/      Canvas 世界层：iso、primitives、terrain、sprites、renderer
  ui/          DOM HUD 层：组件 + hud.css
  generated/   ts-rs 与 content codegen 的产物（禁止手写）
```

**依赖只能向下**：

```
content → protocol
sim     → iso, content, protocol
bridge  → sim, protocol
desktop → launcher, protocol                     （窗口壳 + 复用内嵌资源表；wry/tao 仅 Windows）
web/net → generated, style
web/render → style, generated, net(仅类型)      ✗ 不得 import app
web/ui     → style, generated                   ✗ 不得 import app / net
web/app    → 全部                                 （唯一允许向上引用的编排层）
```

`eslint.config.mjs` 用 `no-restricted-imports` 把 `render/**` 与 `ui/**` 引用 `app/**`
设为 error；`render`/`ui` 也不得直接读 `net/transport`。渲染层与 HUD 层因此可以整体替换
（换成 React/Solid 只改 `web/src/ui`）。

## 2. 一帧发生了什么

```
requestAnimationFrame
  ├─ HudLayer.tick(dt)                     仅表现层计时（字幕淡出、警报条）
  └─ if (boot && snapshot)
       ├─ Renderer.draw(Frame)             Canvas：地形 blit → 地面排序 → 空中 → 轨道 → 光束/特效 → 覆盖层
       └─ HudLayer.update(HudView)         DOM：就地改文本/宽度，不重建

WasmTransport 自己跑 30Hz 定时器：
  oc_step() → oc_snapshot_ptr/len → decodeSnapshot → handlers.onSnapshot(snapshot)
```

渲染 60fps、仿真 30Hz 解耦：仿真按固定步长推进（`TICK_MS = 33`），渲染只读最新快照。
速度档位是仿真内部的倍率（1/2/4 个 tick 每次 step），因此提速不改变确定性语义。

## 3. 怎么加一个建筑（两处，编译器强制）

1. **Rust 数据表** — `crates/content/src/buildings.rs`：在 `BUILDINGS` **末尾**追加一行，
   并给 `B_COUNT` 加一；如果需要在系统里特判，再用 `B_*` 常量。

   ```rust
   BuildingRow { key: "gravity-forge", zh: "重力锻炉", en: "GRAVITY FORGE", desc: "…",
                 cost_alloy: 210, cost_fuel: 15, energy: -22, footprint: 2, build_ms: 13000,
                 category: CAT_BUILD, hp: 320, tech: NO_TECH, range: 0, capacity: 0, tier: 1 },
   ```

2. **TS 绘制注册** — `web/src/render/sprites/buildings.ts`：在 `BUILDING_PAINTERS` 里加键。

   因为 `BUILDING_KEYS` 由 `cargo test -p oc-content` 生成
   （`web/src/generated/content-keys.ts`），`BuildingKey` 联合类型会立刻包含新键；
   `Record<BuildingKey, BuildingPainter>` 缺一项就是**编译错误**，不是运行时的空白格。

然后 `node scripts/ci.mjs --web`（或 `npx tsc --noEmit`）确认。

> 若该建筑有独特机制（例如需要一个新系统），在 `crates/sim/src/systems/` 加一个
> `System` 实现并在 `systems::run_all` 的**固定顺序**里插入 —— 顺序属于确定性契约，
> 改动会让旧回放失效，需要在 `docs/decisions.md` 记录。

加航线 / 加单位 / 加事件同理：表 + 绘制/文案注册，系统逻辑不变。

## 4. 怎么换 Transport

唯一契约在 `web/src/net/transport.ts`：

```ts
export interface Transport {
  readonly kind: 'wasm' | 'websocket';
  start(handlers: TransportHandlers): Promise<void>;   // onBoot / onSnapshot / onError
  send(commands: readonly Command[]): void;
  close(): void;
  queryPlace?: (kind: number, tx: number, ty: number) => BuildQuery;
}
```

`app/app.ts` 只依赖这个接口。要接服务端：

```ts
// 1. 实现接口
export class WebSocketTransport implements Transport {
  readonly kind = 'websocket' as const;
  async start(handlers) { /* ws.binaryType = 'arraybuffer'; 收二进制帧 → decodeSnapshot */ }
  send(commands) { this.ws.send(encodeCommandBatch(commands)); }
  close() { this.ws.close(); }
}

// 2. 换一行
- this.transport = new WasmTransport();
+ this.transport = new WebSocketTransport(url);
```

要求：**二进制帧**（`decodeSnapshot` / `encodeCommandBatch` 已就绪），不接受每 tick JSON；
`start` 之后由 Transport 自己推送 `onSnapshot`，因此在「谁驱动 tick」这点上两种实现可互换
（wasm 自己跑 30Hz 定时器，服务端自然是权威端）。

## 5. 协议与会话

- `PROTOCOL_VERSION` 在 `crates/protocol/src/version.rs`；客户端版本不符会直接拒绝启动。
- 启动一次：`oc_init(seed)` → `BootBlob`（`Catalog` + 行星参数 `MapView`）→ 之后每帧只发 `Snapshot`。
  `BootBlob` 不含地形数组；客户端按视口调用 `oc_chunk(cx, cy)` 流送 32×32 的 `ChunkView`。
- 命令：`CommandBatch { client_tick, commands: Vec<Command> }`，postcard。
- 扩展协议：**只在枚举末尾追加 variant**，不改既有字段；随后跑
  `cargo test -p oc-protocol` 重新生成 `web/src/generated/` 与 `web/tests/fixtures/`，
  `npx vitest run` 会验证两侧一致。

## 6. 确定性契约（改代码前必读）

`crates/sim` 里禁止：浮点状态、`std::time`、`rand`、HashMap 迭代顺序依赖、I/O。
随机数只能来自 `RngStreams` 的命名流域（terrain/economy/combat/director/cosmetic），
新增消费者要用**新的**流域或 `fork()`，不能插进已有流域的取数序列中间。

状态哈希 = 对 `hash = 0` 的快照做 postcard 编码，对字节做 FNV-1a，再带哈希重编码一次。
所以「新增一个快照字段」会自动进入哈希，不需要维护字段清单。

守卫：`cargo run -p oc-sim-cli -- 3000` 连跑两次比对哈希；`crates/sim/tests/determinism.rs`
用「push 命令」与「postcard 编解码命令」两条路径比对同一脚本的结果。

## 7. 常用命令

```powershell
node scripts/package-exe.mjs         # wasm + vite build + cargo build --release → dist-exe/ 两个 exe
node scripts/build-wasm.mjs          # cargo → web/public/oc.wasm（唯一 wasm 构建步骤）
npx vite build                       # 前端产物 → dist/
npx vite --port 5178                 # 本地开发
node scripts/screenshot.mjs --debug  # 无头截图 + 控制台报错（1920×1080）
node scripts/ci.mjs                  # 全套 CI（Rust + 前端 + 守卫脚本）
node scripts/ci.mjs --web            # 只跑前端
```

`package-exe.mjs` 产两个产物：**桌面版** `APHELION-<ver>.exe`（`crates/desktop`：tao 窗口 +
wry/WebView2，走 `aphelion://` 自定义协议读内嵌资源，不开端口）是主产物；**浏览器版**
`APHELION-<ver>-browser.exe`（`crates/launcher`：loopback HTTP + 默认浏览器）给缺少 WebView2
的机器兜底。两者内嵌的是同一张 `dist/` 资源表（`oc_launcher::assets()`），画面与协议完全一致。

## 8. 入库的构建产物（CI 结构的前提）

仓库里有**三样**本来可以算构建产物的文件被刻意提交了：

| 文件 | 为什么入库 |
|---|---|
| `web/src/generated/*.ts` | ts-rs 从 Rust 结构生成的协议类型。入库后前端不需要 Rust 就能 typecheck；`cargo test` 会重新生成，CI 的 rust job 用 `git diff --exit-code` 检查它是否与 Rust 声明同步。 |
| `web/public/oc.wasm` | 119 KiB 的仿真内核。入库后 web CI job 变成纯 Node，不必在 Ubuntu 上装 Rust（那一步曾是 CI 唯一的抖动源）。它的同步门禁是**行为哈希**而非字节比较：`git show HEAD:web/public/oc.wasm` 取出入库版本，`scripts/wasm-hash.mjs` 跑 300 idle 帧取 `oc_state_hash()`，与原生 `cargo run -q -p oc-sim-cli -- --idle 300` 的输出现场比对（D-11）。 |
| `assets/icon.ico` `assets/icon.rgba` | `scripts/gen-icon.mjs` 画出来的程序图标。前者由 `crates/desktop/build.rs` 编进资源段（连同 manifest 与 VERSIONINFO），后者在运行时给 tao 窗口；生成它需要画图代码而不是外部素材，所以入库避免每次构建都跑一遍脚本。 |

所以 CI 是三个职责清晰的 job：`rust`（内核门禁）、`web`（纯 Node 表现层门禁）、
`package`（Windows 上产出桌面版 + 浏览器兜底两个 exe）。改动 `crates/sim` 或 `crates/protocol` 之后，
本地必须跑一次 `pnpm run wasm` 与 `cargo test` 并提交重新生成的产物，否则 web job 用的
还是旧内核。两类产物的门禁不同：`web/src/generated` 与 `web/tests/fixtures` 是字节级
`git diff --exit-code`（生成结果必须与 Rust 声明逐字一致）；`web/public/oc.wasm` 是行为哈希
（跨平台字节永远不同，见 D-11）。