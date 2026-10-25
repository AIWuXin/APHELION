# 设计文档 / Design — APHELION · 远日点

> 当前规范（含 D-18 现代航天工程图谱视觉迭代）。风格契约、架构、关键取舍、风险与验证方式。
> 实现细节见 [`architecture.md`](architecture.md)，全部取舍与偏离见 [`decisions.md`](decisions.md)。
> 本次视觉设计与验收依据：[`superpowers/specs/2026-10-24-aerospace-visual-redesign-design.md`](superpowers/specs/2026-10-24-aerospace-visual-redesign-design.md)。

---

## 1. 一句话定位

**一台被遗弃在矿脉行星上的远日点指挥终端**：玩家在等距地表建造殖民地，把火箭送上轨道，
用三条星际航线换取合金与研究，然后在周期性跃迁来袭的舰队面前守住指挥中枢。

叙事上的设定直接决定了美术方向：这不是富饶的宜居星球，而是一片**低饱和的矿质荒漠**。
世界的强调色只留给四类角色——能量（橙）、数据（青）、生机（绿）、危险（红）。浅底文字使用
`PALETTE`，深视窗与世界灯带使用同色相的 `SIGNAL`，由此统一 HUD 与地表的材质纪律。

## 2. 风格 token 表（唯一真源 `web/src/style/tokens.ts`）

### 2.1 色彩

| 角色 | 变量 | 值 | 用途 |
|---|---|---|---|
| 深视窗 | `--oc-void` | `#10171b` | 画布深底、雷达、内容显示窗、亮底上的深字 |
| 工程纸面板 | `--oc-panel` | `#e6e3da` | HUD 主面板 |
| 次级面板 | `--oc-panel-2` | `#d8d9d1` | 表头、次级行、按钮 |
| 面板悬停 | `--oc-panel-3` | `#c3cbc6` | hover / pressed |
| 细线 | `--oc-line` | `#b0b5af` | 1px 分隔线 |
| 结构描边 | `--oc-line-bright` | `#758381` | 1px 面板外框 |
| 主文字 | `--oc-ink` | `#1b282c` | 标签、数值 |
| 次文字 | `--oc-ink-2` | `#4e6062` | 说明 |
| 三文字 | `--oc-ink-3` | `#58676a` | 宽字距英文副标题、脚注 |
| 反白文字 | `--oc-ink-inverse` | `#f4f2ea` | 深视窗与深状态底上的文字 |
| **主强调** | `--oc-primary` | `#9c3f22` | 浅底数值、激活、关键动作 |
| 国际橙实底 | `--oc-primary-fill` | `#e9784e` | 选中控件与安全标识（文字转深色） |
| **功能色** | `--oc-function` | `#176c78` | 浅底进度、数据流、航线、连接 |
| **状态色** | `--oc-status` | `#3f684d` | 正常态、生命值 |
| **危险色** | `--oc-danger` | `#a33832` | 警报与敌方，仅此二用 |

> 只有四类强调角色。深视窗与世界使用同色相的 `SIGNAL` 明亮 ramp：primary `#ffb26b`、
> function `#80d6dd`、status `#9bc6a4`、danger `#ef776b`。`scripts/check-assets.mjs`
> 与代码评审共同保证不另立第五种强调色。

### 2.2 光照（不变量 2 的落地形式）

单向左上光。体积物三档明度，写在 `tokens.ts` 的 `LIGHT` 里：

```
top   1.00   屏幕左面 0.86（受光）   屏幕右面 0.68（背光）
亮棱  rgba(255,255,255,.14) 沿左上轮廓 1px
暗缝  rgba(0,0,0,.38)       沿右下轮廓 1px
接触阴影：短、柔、统一偏右下（两层椭圆，无 blur）
```

### 2.3 排版与几何

| 项 | 值 |
|---|---|
| 中文 | Noto Sans SC / 思源黑体 / 微软雅黑（系统栈，700 用于标题） |
| 英文副标题 | 10px，`letter-spacing: .16–.20em`，大写，`--oc-ink-3` |
| 数字/倒计时 | 等宽栈 + `font-variant-numeric: tabular-nums` |
| 字号层级 | 10 / 12 / 14 / 26（三档信息 + 数字显示位） |
| 瓦片 | 64×32（2:1），`z` 每单位 32px |
| 版式 | 顶栏 34px（1080 的 3.1%）、右指挥栏 336px（1920 的 17.5%）、底字幕 30px、左下浮沙盒 |
| 圆角 | 0–2px。HUD 全部直角 |

## 3. 架构

```
             ┌──────────────────────────── Rust（全部规则与仿真）────────────────────────────┐
             │  iso(纯数学/定点/RNG)   content(数据表)   protocol(Command/Snapshot/版本)      │
             │                    sim(6 系统 · 确定性 · 无 I/O)      sim-cli(无头 1000 tick)  │
             └───────────────────────────────────┬──────────────────────────────────────────┘
                                                 │ bridge-wasm：18 个 extern "C" 函数
                                                 │ postcard 二进制经线性内存双向传递
             ┌───────────────────────────────────┴──────────────────────────────────────────┐
  TypeScript │  net(Transport · postcard reader/writer)                                     │
  （全部表现）│     ├─ WasmTransport  ←── 现在（单机 demo）                                  │
             │     └─ WebSocketTransport ←── 可选 P4（crates/server 复用同一套 crate）      │
             │  app(store · loop · input)   →   Command[]                                  │
             │        ↑ Snapshot                                                           │
             │  render(Canvas 世界层)        ui(DOM HUD 层)                                 │
             │        └──── 共用 style/tokens.ts（同一套色板 token）────┘                     │
             └────────────────────────────────────────────────────────────────────────────┘
```

**单向数据流**：`输入 → Command[] → Transport.send → sim.step() → Snapshot → 渲染 / HUD`。
渲染与 HUD 只读 `Snapshot`，不持有规则；需要「能不能建在这里」时调用
`oc_query_place` 让仿真回答，而不是在 TS 里重写一遍判定。

**为什么 Rust 只做内核**：确定性、可回放、可复用给原生端或服务端；而 HUD 的 1px 边框与
中文渲染必须交给浏览器排版引擎，所以世界用 Canvas、HUD 用 DOM。

## 4. 关键取舍（详细理由见 decisions.md）

| # | 取舍 | 理由（一句话） |
|---|---|---|
| 1 | 裸 `extern "C"` ABI，不用 wasm-bindgen / wasm-pack | 协议本来就是二进制，桥接只需「写字节-调用-读字节」；构建只剩一条 cargo 命令，无工具链版本漂移 |
| 2 | postcard + 手写 TS 读取器 + **金标准固件测试** | 满足「禁止每 tick JSON」，且 Rust 写出的字节被 TS 测试逐字段校验，两边不可能悄悄漂移 |
| 3 | 地表走「连续矿质材质」而非逐格暗缝与饱和草地 | 12/5 格 companion 斑块、世界坐标纹理相位与稀疏 speck 保留大形；人工网格只属于道路和地坪 |
| 4 | 光源方向按「左上光 + 阴影右下」执行 | 规范里「顶/右/左 = 1.0/0.86/0.68」的面序与左上光在镜像投影下互斥；明度级差 1.0/0.86/0.68 完整保留，只交换左右归属（见 decisions #1） |
| 5 | 施工位/机位：正交投影固定，但允许平移与正交缩放 | 不变量 1 约束的是**投影无透视无旋转**，不是禁止平移/缩放；10240² 环面按视口流送区块，取景必须能自由移动 |
| 6 | 字体用系统栈，不打包 Noto Sans SC | 零外部请求（禁位图/外部资源精神），Windows 自带微软雅黑，中文不会乱码 |
| 7 | 地形按 32×32 区块流送并烘焙到离屏画布 | 60fps 的关键：世界层只重绘动态物；可见区块按视口裁剪、每帧 4ms 烘焙预算，画布像素预算 24 Mpx（约 96MB），行星不整图驻留 |
| 8 | 内容表在 Rust，TS 通过 codegen 的 key 数组得到联合类型 | 新增建筑只改两处（Rust 表 + TS 绘制注册），且漏了绘制函数是**编译错误** |
| 9 | AI 档位用追加的 `SetAi` 命令，而非塞进 sandbox flags | 枚举「可扩展、不可删」，追加 variant 语义清晰，且不污染既有字段含义 |
| 10 | 状态哈希 = 对「hash=0 的快照字节」做 FNV-1a 再重编码 | 无需人工维护字段清单，新增字段自动纳入哈希 |

## 5. 风险与验证

| 风险 | 影响 | 缓解 / 验证 |
|---|---|---|
| 二进制协议两侧漂移 | HUD 数字错乱，最隐蔽的失败 | Rust 测试产出 `snapshot.bin` / `commands.bin` / `boot.bin`；`web/tests/postcard.test.ts` 逐字段比对 + 命令字节逐字节比对 |
| 确定性被无意破坏 | 回放与哈希失效 | 状态只用整数/定点；`crates/sim` 禁 float 状态、禁时钟、禁 HashMap 顺序依赖；`oc-sim-cli` 连跑两次比对哈希，CI 强制 |
| wasm 工具链在本机不可用 | 无法交付 | 只用 `cargo build --target wasm32-unknown-unknown`，无 wasm-pack；`scripts/build-wasm.mjs` 单步复制产物 |
| 视觉漂移（越做越像通用科幻 UI） | 验收「同一套语言」失败 | 8 条不变量写进 README 验收清单；截图回归 `scripts/screenshot.mjs`；token 文件冻结 |
| 后期帧率掉下 60 | 交互手感崩坏 | 地形 24 Mpx + 建筑静态主体 8 Mpx LRU；body/motion 分离、共享锚点、逐帧烘焙预算与 `?debug=1` 可观测 |
| 单文件膨胀 | 维护性下降 | `scripts/check-file-length.mjs` 在 CI 里强制 ≤400 行 |
| 并行开发互相踩踏 | 集成失败 | 目录级写权限切分（crates/sim · web/render · web/ui · app/net），protocol 与 token 冻结 |

## 6. 阶段与原创点

| 阶段 | 内容 | 原创设计点 |
|---|---|---|
| P0 | 脚手架 + CI + 协议骨架 | **内容 key 数组由 Rust 生成 TS 联合类型**：新增建筑漏画即为编译错误 |
| P1 | 仿真六系统 + 确定性哈希 | **哈希即编码**（对 hash=0 的帧做 FNV 再重编码）；多流域 RNG |
| P2 | Canvas 世界层 + DOM HUD | **等高线崖壁**（由 elevation step 生成的 3–4px 岩面）、矿脉琥珀点、雷达地表轮廓取自真实材质场 |
| P3 | 交互闭环 + 动效 + 性能 | 轨道航线地面走线（青色行进虚线）、发射台火箭升空高度 = `progress`、施工骨架随 `progress` 长高 |
| P4（可选） | WebSocketTransport + 断线重连 | 预留接口，未启用 |
