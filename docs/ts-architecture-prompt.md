# 工程化提示词：TypeScript 多文件模块化版（可维护优先）

> 配套：先粘 [sci-fi-style-prompt.md](sci-fi-style-prompt.md)（美术 + 玩法规格），再粘本文件（工程架构规格）。
> 结论：浏览器里的等距 Canvas 游戏 + DOM HUD，**首选 TypeScript strict + Vite + 零运行时依赖**；Rust 只在"仿真要复用/要做多人服务器/要原生端"时拆内核（见附录 B）。

---

## 一、语言选型（先把这件事说清楚）

| 方案 | 适合 | 不适合 |
|---|---|---|
| **TS strict + Vite**（推荐） | 浏览器单机、DOM HUD、快速迭代、小团队长期维护；UI 层可随时换 React/Solid 而不动核心 | 需要原生性能上限 / 服务器权威仿真复用 |
| Rust + WASM（附录 B） | 确定性仿真内核、多人服务器复用、原生端；长期性能上限 | 美术/UI 迭代期，工具链与调试成本高 |
| Rust 全栈（含渲染） | 桌面端、对包体和 GC 有硬要求 | 浏览器里画 DOM HUD 最终还是 JS，收益低 |

一句话：**表现层用 TS，仿真内核如需跨端再拆 Rust。** 本提示词按 TS 写，Rust 变体见附录。

---

## 二、主提示词（在科幻规格之后粘贴这一段）

```text
在已确认需求（等距 2.5D 硬科幻 RTS 的画面与玩法规格）基础上，用 TypeScript 严格模式 + Vite + 零运行时依赖做多文件模块化实现。优先级：可维护性与类型安全 > 功能速度 > 视觉细节。

【技术栈】
- TypeScript 5.x，tsconfig 必须开启：strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、noImplicitOverride、noFallthroughCasesInSwitch、noUnusedLocals、noUnusedParameters、verbatimModuleSyntax、isolatedModules。禁止 any、@ts-ignore、非空断言 !（除非紧邻注释说明理由）。
- 构建 Vite；测试 Vitest；Lint ESLint（typescript-eslint）+ Prettier。
- 零运行时依赖：不引 React/Vue/zod/lodash/游戏引擎；HUD 用自写 ~100 行快照 store + 原生 DOM；渲染用 Canvas 2D。
- 包管理 pnpm，Node 20+。

【目录结构（必须按此分层；同类可合并，但不得退化成单文件）】
src/
  main.ts
  app/{app.ts, loop.ts, events.ts}
  core/{math.ts, vec2.ts, iso.ts, rng.ts, noise.ts, time.ts, ids.ts, event-bus.ts}
  config/{tokens.ts, layout.ts, balance.ts, content/{types.ts, buildings.ts, units.ts, routes.ts}}
  types/{world.ts, commands.ts, ui.ts}
  world/{tile-map.ts, terrain-gen.ts, grid.ts, placement.ts, world.ts}
  systems/{system.ts, economy.ts, build.ts, launch.ts, logistics.ts, combat.ts, ai-director.ts}
  render/{renderer.ts, camera.ts, terrain-layer.ts, entity-layer.ts, sprite-cache.ts, palette.ts, primitives.ts, sprites/{index.ts, buildings.ts, vehicles.ts, props.ts}}
  ui/{hud.ts, store.ts, dom.ts, icons.ts, components/{top-bar.ts, command-panel.ts, star-map.ts, sandbox-panel.ts, alert-banner.ts, subtitle.ts}}
  input/{pointer.ts, keyboard.ts, commands.ts}
  debug/{debug-console.ts, profiler.ts}
  persistence/{save.ts, migrations.ts}
tests/{iso.test.ts, placement.test.ts, economy.test.ts, logistics.test.ts, combat.test.ts, determinism.test.ts}

【架构铁律】
1) 单向依赖：config → core → types → world → systems → (render | ui | input) → app。禁止反向 import；用 ESLint no-restricted-imports 按目录禁止（systems 不得 import ui/render；render 与 ui 不得 import systems）。
2) 单一真相：WorldState 是唯一可变状态；systems 修改状态；render/ui 只读；UI 只读 HudModel 快照，禁止直接读 WorldState。
3) Command 模式：输入层不直接改状态，只产出 Command 联合类型，由 app 分发；便于单测、回放、撤销。
4) 纯函数核心：core/* 与 placement 校验为纯函数、无副作用；随机数由调用方传 RNG。
5) 内容数据驱动（维护性关键）：建筑/单位/航线全部定义在 config/content/*.ts 的只读表，用 satisfies 校验；新增内容只加一条记录 + 注册一个绘制函数，不改系统代码；渲染注册表用 Record<Id, Renderer> 保证编译期完备。
6) 确定性：固定步长 1/60；RNG 分流域（terrain/battle/economy 各一个 mulberry32）；禁止 Math.random；测试用同 seed 跑 600 tick 比对状态哈希。
7) 类型安全：EntityId/TileCoord 用品牌类型；状态字段 readonly；校验结果用 Result<T,E> 不抛异常；switch 用 never 穷尽检查；事件总线 EventBus<AppEvents> 类型映射。
8) 性能：地形分块离屏缓存；精灵缓存 key = type+facing；热路径不分配对象；HUD 脏检查（值不变不写 DOM）；目标 60fps。
9) 文件纪律：单文件 ≤ 400 行；一模块一职责；只用命名导出，不用 default export；文件名 kebab-case（避免 Windows 大小写问题）。
10) 可观测：debug overlay 显示 fps / 实体数 / 各 system 耗时；?debug=1 开启；生产构建 tree-shake。

【核心接口（按此签名，不得随意改）】
interface System { readonly name: string; update(ctx: AppContext, dt: number): void; }
interface AppContext {
  readonly state: WorldState;
  readonly rng: RngStreams;
  readonly bus: EventBus<AppEvents>;
  readonly content: ContentDatabase;
}
type Command =
  | { kind: 'place-building'; building: BuildingId; at: TileCoord }
  | { kind: 'demolish'; entity: EntityId }
  | { kind: 'launch'; pad: EntityId }
  | { kind: 'toggle-route'; route: RouteId; enabled: boolean }
  | { kind: 'set-sandbox'; key: SandboxKey; value: boolean | number | 'early' | 'mid' | 'late' }
  | { kind: 'pause' }
  | { kind: 'set-speed'; speed: 1 | 2 | 4 };
interface HudModel {
  readonly resources: Readonly<Record<ResourceId, number>>;
  readonly tasks: readonly TaskRow[];
  readonly tabs: readonly TabState[];
  readonly cards: readonly BuildCardState[];
  readonly alerts: readonly Alert[];
  readonly subtitle: SubtitleModel | null;
  readonly sandbox: SandboxModel;
}
// UI 组件统一：mount(parent: HTMLElement): void; update(model: HudModel): void;

【测试（交付必须全绿）】
- pnpm typecheck（tsc --noEmit）、pnpm lint、pnpm test、pnpm build 四项全绿。
- 至少覆盖：iso 投影互逆、放置合法性（越界/重叠/资源不足/地形限制）、经济 tick 产出、物流航线吞吐与状态、战斗伤害与击毁、同 seed 确定性哈希。
- system 的逻辑与渲染解耦，可 headless 单测。

【交付流程（每阶段四绿 + 截图 + 自检，禁止最后一起调）】
Phase 0：脚手架 + tsconfig + vite + eslint/prettier + vitest + 目录与类型骨架（空实现/TODO），跑通四项检查。
Phase 1：core + config content + world + placement + 单测，headless 跑通仿真。
Phase 2：渲染层（地形分块/精灵缓存/相机/画家排序）+ HUD 静态组件，出截图。
Phase 3：输入 → Command → 系统联动 + 玩法闭环（建造/发射/物流/战斗/调试台）+ 性能达标。

【验收 / 维护性检查】
- 全项目 grep 不到 any、@ts-ignore、Math.random；render 不 import systems；ui 不 import world。
- 新增一个建筑：只改 config/content/buildings.ts + render/sprites/buildings.ts 注册，类型系统强制补全其余。
- 新增一种资源：只改 config 与 balance，系统代码改动 ≤ 2 处。
- README 或 docs/architecture.md 写明分层、四阶段、新增内容步骤、脚本命令；记录 3 条不变量：单向依赖 / 单一真相 / 确定性。
- 单文件 ≤ 400 行；无循环依赖；构建产物零外部图片请求；1920×1080 与 1280×720 不破版；FPS ≥ 55。
```

---

## 三、配套的 tsconfig / 脚本 / CI（可直接抄）

**tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

**package.json scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings=0",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "ci": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
  }
}
```

**ESLint 关键规则（按目录禁 import，防架构腐化）**

```js
// eslint.config.js 片段
rules: {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'warn',
  '@typescript-eslint/consistent-type-imports': 'error',
  'no-restricted-imports': ['error', {
    patterns: [
      { group: ['**/systems/*'], message: 'render/ui 不得依赖 systems，只读快照。' },
      { group: ['**/ui/*'], message: 'systems/render 不得依赖 ui。' },
      { group: ['**/render/*'], message: 'systems 不得依赖 render。' },
      { group: ['**/world/*'], message: 'ui 不得直接读 world，请用 HudModel。' }
    ]
  }]
}
```

**CI（GitHub Actions）**

```yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm ci
```

---

## 四、维护性设计要点（为什么这套结构能活过三个月）

1. **内容数据表 + 注册表完备性**：新增建筑/单位/航线 = 加一条记录 + 一个绘制函数，`Record<Id, Renderer>` 让 TypeScript 在编译期逼你补齐，不会"漏画一个建筑但运行时报 undefined"。
2. **快照 UI**：HUD 只吃 `HudModel`，把"逻辑状态"和"界面状态"解耦；换 React/Solid 时只换 ui 目录，核心不动。
3. **Command 模式**：输入、AI、存档回放共用一条命令通道；以后加撤销/多人联机不用重构。
4. **确定性**：种子 + 固定步长 = 可复现 bug、可比对回归、可做录像回放。
5. **依赖方向用 lint 锁死**：架构不靠自觉，靠 CI 阻断。
6. **阶段交付 + 四绿**：每阶段都能编译、能测、能截屏，避免"大爆炸集成"。

## 五、四个阶段的验收清单（复制到 PR 模板里）

- [ ] `pnpm ci` 四绿（typecheck / lint / test / build）
- [ ] 无 `any`、`@ts-ignore`、`Math.random`
- [ ] 目录依赖方向无违规（lint 通过）
- [ ] 单文件 ≤ 400 行，无 default export
- [ ] 本阶段截图与参考风格并排比对（色板/版式/字号/1px 边）
- [ ] 新增内容是否只需改配置表（抽查 1 次）
- [ ] 60fps（?debug=1 查看 fps 与 system 耗时）

---

## 附录 A：如果 UI 想用框架

把 `ui/` 换成 React/Solid 也可以：`HudModel` 作为 props，`Store` 作为外部 store（useSyncExternalStore / createSignal）。但**核心层不得 import 任何框架**，渲染层与 HUD 层保持可替换。初期建议零依赖，先跑通再评估。

## 附录 B：Rust 变体（仿真内核 + TS 表现层）

```text
采用「Rust 仿真内核 + TS 表现层」，不是把整个游戏搬进 Rust。
- Cargo workspace：
  crates/iso       纯数学（等距投影、网格），无依赖，100% 单测
  crates/content   serde 数据表（建筑/单位/航线），编译期类型 + 运行时校验
  crates/sim       确定性仿真（固定步长、分流域 RNG、命令队列），不依赖渲染
  crates/bridge    wasm-bindgen：导出只读快照（FlatBuffers 或打包的 f32/u32 缓冲）+ 接收命令队列
  web/             Vite + TS 薄层：Canvas2D 渲染 + DOM HUD（沿用本文件的 ui/render 分层）
- 边界规则：每帧只跨边界传两类数据——只读快照与命令队列；JS 不参与 sim，Rust 不碰 DOM。
- 质量门：cargo fmt --check、cargo clippy -- -D warnings、cargo test（含同 seed 确定性哈希）、wasm-pack build 后体积检查。
- 适用：需要服务器权威仿真、原生端复用、超大规模单位；否则工具链成本 > 收益。
```

## 附录 C：不建议的做法

- 单文件 `index.html` 里塞 3000 行（可维护性为零，哪怕能跑）。
- 引 React + 全量 re-render 驱动 60fps 游戏画面（DOM 只做 HUD，画面走 Canvas）。
- 把渲染代码写进 system（无法 headless 测试）。
- 用 `any` 绕过内容表类型（等于放弃"新增内容只改配置"的保障）。
- 用 `Math.random` 做地形/战斗（无法复现、无法回归测试）。
