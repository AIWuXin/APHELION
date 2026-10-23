# APHELION Aerospace Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 a1 的世界、建筑、单位和 HUD 重做为纯代码“现代航天工程图谱”，同时保持玩法与协议不变并建立有界静态建筑缓存。

**Architecture:** 保留 Canvas2D 世界、DOM HUD、Rust/wasm 仿真和现有等距投影。地表继续使用分帧区块烘焙；建筑迁移为 `body` 静态主体 + `motion` 动态部件，静态主体按 raster scale 进入 8 Mpx LRU；UI/世界共用浅底 `PALETTE` 与深底 `SIGNAL` 两套同色相 ramp。

**Tech Stack:** TypeScript 5.9、Canvas2D、DOM/CSS、inline SVG、Vitest、Vite、Rust/wasm（本次不改）、现有 Playwright 脚本与 Kimi 内置浏览器。

**Spec:** `docs/superpowers/specs/2026-10-24-aerospace-visual-redesign-design.md`

## Global Constraints

- 零新依赖、零第三方美术、零运行时图片/字体/外部请求、无 emoji/icon font/`Math.random`。
- 不改 Rust、wasm、协议、fixtures、仿真哈希、版本号、footprint、价格、科技、属性、输入或投影。
- 保持顶栏 34px、右栏 336/300px、面板顺序和控件；手写 TS/CSS/MJS/TOML ≤400 行。
- 文字/背景关键组合对比度 ≥4.5:1；地形预算保持 24 Mpx，建筑缓存上限 8 Mpx。
- 所有提交只暂存本任务明确列出的文件；`.tmp` 截图与日志不入库。
- 最终必须通过 `node scripts/ci.mjs`、真实交互验收、双 exe 打包、提交推送和远端 CI。

## Review Focus

1. **跨 chunk/环面材质不连续**：新 mask 必须保持 halo-first 与加载顺序无关；Task 2 运行现有 `chunk-store.test.ts` 和边界参考测试。
2. **time/view 泄漏进静态缓存**：body 只能接收 `BuildingBodyEnv`，动态部件留在 motion；Task 5 锁定接口，Tasks 6–8 逐组做动画实测，Task 8 检查全部 body 已迁移。
3. **高 DPR/缩放或超大 sprite 造成缓存抖动**：量化到 0.5 档并限制 1–3，超大单件不缓存；Task 5 测试 scale、LRU、替换与 oversize。
4. **浅 HUD 的文字/警报对比不足**：Task 1 固定色板对比测试，Task 4 检查深色视窗、彩色标签与两种视口，不允许靠 opacity 隐藏关键文字。
5. **美术轮廓与拾取/状态错位**：footprint 与锚点不变，bounds/healthY 显式定义；Task 5 测试 bounds，Task 9 点击全部建筑、单位并检查施工/受损/发射。

---

### Task 1: 色板、信号 ramp 与基线

**Files:**
- Modify: `web/src/style/tokens.ts`
- Modify: `web/src/style/inject-theme.ts`
- Modify: `web/src/style/base.css`
- Modify: `web/src/render/world-palette.ts`
- Test: `web/tests/palette.test.ts`

**Interfaces:**
- Produces: `PALETTE.inkInverse`、`SIGNAL.primary/function/status/danger`、`GLOW` 从 `SIGNAL` 读取；CSS `--oc-ink-inverse` 与四个 `--oc-signal-*`。
- Consumes: 后续所有世界和 HUD 任务共用这些 token，不另写强调色。

- [ ] **Step 1: 保存旧版基线**
  在修改代码前，以 seed `1602900180`、`?debug=1&demo=1`、1280×720 截取当前开场，保存到 `.tmp/art-before-1280.png` 并用媒体读取确认。

- [ ] **Step 2: 写失败的对比度测试**
  新建 `palette.test.ts`，导入 token，使用 WCAG 相对亮度公式；断言所有 spec 的浅底文字组合 ≥4.5，且 `SIGNAL`/`void` ≥4.5。例如：

```ts
expect(contrast(PALETTE.ink3, PALETTE.panel)).toBeGreaterThanOrEqual(4.5);
expect(contrast(PALETTE.void, PALETTE.primaryFill)).toBeGreaterThanOrEqual(4.5);
expect(contrast(SIGNAL.function, PALETTE.void)).toBeGreaterThanOrEqual(4.5);
```

- [ ] **Step 3: 验证测试先失败**
  Run: `npx vitest run web/tests/palette.test.ts`
  Expected: FAIL，因为 `inkInverse`/`SIGNAL` 尚不存在。

- [ ] **Step 4: 实现精确色板**
  使用 spec §4.1 的每个十六进制值，不自行换色；注入新增 CSS 变量，更新 base fallback 与 `GLOW`，不改其他绘制逻辑。

- [ ] **Step 5: 验证**
  Run: `npx vitest run web/tests/palette.test.ts && npx tsc --noEmit`
  Expected: 新测试 PASS，typecheck PASS。

- [ ] **Step 6: 提交**
  `git add web/src/style/tokens.ts web/src/style/inject-theme.ts web/src/style/base.css web/src/render/world-palette.ts web/tests/palette.test.ts && git commit -m "feat: add aerospace visual tokens"`

### Task 2: 连续地表规则

**Files:**
- Create: `web/src/render/terrain/surface-rules.ts`
- Modify: `web/src/render/terrain/noise.ts`
- Modify: `web/src/render/terrain/paint.ts`
- Test: `web/tests/terrain-style.test.ts`
- Test: `web/tests/chunk-store.test.ts`

**Interfaces:**
- Produces: `hasTileSeam(material: number): boolean`，仅 apron/road 为 true；`companionMask` 使用 12/5 格噪声。
- Consumes: `TERRAIN_KEYS`、现有 `valueNoise`、`rand01` 和 ChunkStore halo。

- [ ] **Step 1: 写失败测试**
  `terrain-style.test.ts` 断言自然材质 0–4/7–14 无逐格缝、apron/road 有缝；用独立参考公式比较 `companionMask`：

```ts
v = valueNoise(tx, ty, 12, 0x51e7) * 0.76
  + valueNoise(tx, ty, 5, 0x9e37) * 0.24
  + (rand01(tx, ty, 0x77a1) - 0.5) * 48;
expected = mix > 0 && v > 700 - mix * 0.5;
```

  覆盖 `(0,0)`、负局部坐标、chunk 边界 `(31/32)` 和环面 `(10239/0)` 附近；另断言重复调用一致、`mix=0` 恒 false。

- [ ] **Step 2: 验证测试先失败**
  Run: `npx vitest run web/tests/terrain-style.test.ts web/tests/chunk-store.test.ts`
  Expected: 新测试因缺少 `hasTileSeam` 和旧 4/2 mask 而 FAIL；现有测试失败则记录但不修改其断言。

- [ ] **Step 3: 实现连续规则**
  在 `surface-rules.ts` 按生成 key 判断人工接缝；`noise.ts` 使用上述 12/5、0.76/0.24、48 公式；`paint.ts` 对自然材质跳过 `seams`，保留材质交界混合、真实崖壁和全部烘焙顺序。

- [ ] **Step 4: 验证**
  Run: `npx vitest run web/tests/terrain-style.test.ts web/tests/chunk-store.test.ts web/tests/torus.test.ts && npx tsc --noEmit`
  Expected: 全部 PASS，尤其 halo-first 仍 byte-identical。

- [ ] **Step 5: 提交**
  `git add web/src/render/terrain/surface-rules.ts web/src/render/terrain/noise.ts web/src/render/terrain/paint.ts web/tests/terrain-style.test.ts && git commit -m "feat: make natural terrain continuous"`

### Task 3: 世界材质、矿脉与地貌

**Files:**
- Modify: `web/src/render/world-palette.ts`
- Modify: `web/src/render/terrain/materials-a.ts`
- Modify: `web/src/render/terrain/materials-b.ts`
- Modify: `web/src/render/terrain/materials-c.ts`
- Modify: `web/src/render/terrain/decor.ts`
- Modify: `web/src/render/terrain/ground-marks.ts`
- Modify: `web/src/render/terrain/cliff.ts`
- Modify: `web/src/render/terrain/rock.ts`

**Interfaces:**
- Consumes: Task 1 token 与 Task 2 连续 mask/接缝规则；`MaterialTexture` 签名保持不变。
- Produces: 连续的大尺度材质；不改变 `TileInfo`、地图数据或烘焙接口。

- [ ] **Step 1: 重画自然与人工材质**
  按 spec §4–5：陶瓷白/石墨/橙的世界色，去掉每格重复半格印章，世界坐标驱动层理/风纹；speck 减少 50–70%，人工地坪保留技术缝，晶矿改烟晶，水面用稀疏长波。

- [ ] **Step 2: 重画矿脉与地貌**
  金属矿形成暗根+脉线+少量切面，煤矿保持扁平黑色；强化岩石/崖壁三面与接触阴影，降低植被黄绿亮点。所有随机仍来自 tile 坐标 salt。

- [ ] **Step 3: 静态验证**
  Run: `npx tsc --noEmit && npx eslint web/src/render web/tests && npx vitest run web/tests/terrain-style.test.ts web/tests/chunk-store.test.ts && node scripts/check-file-length.mjs && node scripts/check-assets.mjs`
  Expected: 全部 PASS，无文件超过 400 行。

- [ ] **Step 4: 实机检查**
  启动 `pnpm exec vite --host 127.0.0.1`，在内置浏览器查看同 seed 开场、跨接缝平移、水域与冷带；与 `.tmp/art-before-1280.png` 对比。Expected: 无逐格裂纹棋盘、无 32 格烘焙缝、材质连续且资源可辨。

- [ ] **Step 5: 提交**
  `git add web/src/render/world-palette.ts web/src/render/terrain && git commit -m "feat: redesign planetary materials"`

### Task 4: 浅色航天 HUD、等距图标与雷达

**Files:**
- Modify: `web/src/ui/hud.css`
- Modify: `web/src/ui/topbar.css`
- Modify: `web/src/ui/overlays.css`
- Modify: `web/src/ui/panels.css`
- Create: `web/src/ui/fabricator.css`
- Modify: `web/src/ui/intel.css`
- Modify: `web/src/ui/hud.ts`
- Create: `web/src/ui/icon-kit.ts`
- Create: `web/src/ui/icons-assets.ts`
- Modify: `web/src/ui/icons.ts`
- Modify: `web/src/ui/radar.ts`
- Modify: `web/src/ui/radar-chrome.ts`

**Interfaces:**
- Consumes: Task 1 的 `PALETTE`、`SIGNAL` 和 CSS 变量。
- Produces: `BUILDING_ICONS`/`UNIT_ICONS` 继续按生成顺序导出 16/7 项；HUD DOM 类名和 actions 不变。

- [ ] **Step 1: 先拆样式和图标边界**
  将 `panels.css` 的 fabricator 区块移入 `fabricator.css` 并在 `hud.ts` 导入；`icon-kit.ts` 只负责 SVG wrap，`icons-assets.ts` 负责建筑/单位双色等距图标，`icons.ts` 保留通用图标并 re-export 两个数组。

- [ ] **Step 2: 实现浅色工程面板**
  面板/顶栏/沙盒/字幕使用暖白与深墨；雷达和肖像视窗使用 void；激活态用 primaryFill+void，深 status/danger 标签用 inkInverse。正文 12、标题 14，英文辅助优先 10px 和 0.16–0.20em；不移动控件。

- [ ] **Step 3: 实现 16+7 等距图标**
  每种资产用大形+一个功能部件，使用 currentColor/token 和少量填充面，保持数组顺序及数量，不加入图片/emoji。

- [ ] **Step 4: 适配雷达**
  `radar.ts` 背景用 void，地表/扫描/航线/敌对信号用 SIGNAL；`radar-chrome.ts` 同样切换；文字用 inkInverse。3×3 中枢与选中定位使用 `footprint / 2`，保留 96 格和 12 帧地面缓存。

- [ ] **Step 5: 自动与实机验证**
  Run: `npx tsc --noEmit && npx eslint web/src web/tests && npx vitest run && node scripts/check-file-length.mjs && node scripts/check-assets.mjs`
  Expected: 全部 PASS。内置浏览器检查 1280×720/1920×1080，雷达、按钮、科技、日志、沙盒、警报均清晰且无溢出；Network 无图片/字体/外部请求。

- [ ] **Step 6: 提交**
  `git add web/src/ui && git commit -m "feat: redesign aerospace command hud"`

### Task 5: 建筑渲染契约与有界缓存（画面等价）

**Files:**
- Modify: `web/src/render/sprite-contract.ts`
- Create: `web/src/render/sprites/pixel-lru.ts`
- Create: `web/src/render/sprites/sprite-cache.ts`
- Create: `web/src/render/sprites/building-renderer.ts`
- Modify: `web/src/render/sprites/buildings.ts`
- Modify: `web/src/render/sprites/detail.ts`
- Modify: `web/src/render/renderer.ts`
- Test: `web/tests/sprite-cache.test.ts`

**Interfaces:**
- Produces:

```ts
interface SpriteBox { left: number; top: number; right: number; bottom: number }
interface BuildingBodyEnv { ctx: CanvasRenderingContext2D; tile: number }
type BuildingBodyPainter = (env: BuildingBodyEnv, cx: number, cy: number, def: BuildingDef) => void;
interface BuildingArt {
  body: BuildingBodyPainter | null; // 迁移期 legacy 为 null，Task 8 改为必填
  motion: BuildingPainter | null;
  bounds: SpriteBox;
  healthY: number;
}
```

  `rasterScale(dpr: number, zoom: number): number = clamp(ceil(dpr*zoom*2)/2, 1, 3)`；`PixelLru<T>.get(key: string): T | undefined`、`put(key: string, value: T, pixels: number): void`、`size/pixelCount: number`；`BUILDING_ART: Record<BuildingKey, BuildingArt>`；`drawBuilding` 统一施工、body、motion、受损。legacy healthY 依次为 3×3=-146、2×2=-92、1×1=-76。

- [ ] **Step 1: 写失败缓存测试**
  断言 scale 的 1、1.5、2.5、3 档与非法输入回退；LRU 命中刷新、同 key 替换扣旧像素、超预算逐出最旧项、单件 oversize 不驻留；初始 16 类 legacy art 都有有效 bounds/healthY。

- [ ] **Step 2: 验证测试先失败**
  Run: `npx vitest run web/tests/sprite-cache.test.ts`
  Expected: FAIL，因为缓存与 `BUILDING_ART` 尚不存在。

- [ ] **Step 3: 实现纯缓存策略**
  `pixel-lru.ts` 不访问 DOM；`sprite-cache.ts` 以 building key+raster scale 建 key，按 `SpriteBox` 高分辨率绘制 body，8 Mpx 上限，blit 后恢复 smoothing/Transform；禁止 time/view 进入 cache key。

- [ ] **Step 4: 接入 legacy adapter**
  `buildings.ts` 暂时把原 RAW painter 包成 `body:null,motion:painter` 的完整 `BUILDING_ART`，不再用 `withStates` 包两次；`building-renderer.ts` 统一状态；`renderer.ts` 每帧只计算一次 raster scale，并用 `art.healthY` 替代魔法高度。旧版此时应画面等价。

- [ ] **Step 5: 验证**
  Run: `npx vitest run web/tests/sprite-cache.test.ts && npx tsc --noEmit && npx eslint web/src web/tests && npx vitest run`
  Expected: 全部 PASS；实机施工、受损、雷达盘、吊车和火箭动画与接入前一致。

- [ ] **Step 6: 提交**
  `git add web/src/render web/tests/sprite-cache.test.ts && git commit -m "refactor: cache static building bodies"`

### Task 6: 建筑组 A——地标与殖民设施

**Files:**
- Create: `web/src/render/sprites/buildings/hq.ts`
- Create: `web/src/render/sprites/buildings/refinery.ts`
- Delete: `web/src/render/sprites/buildings/landmarks.ts`
- Modify: `web/src/render/sprites/buildings/structures.ts`
- Create: `web/src/render/sprites/buildings/structures-motion.ts`
- Modify: `web/src/render/sprites/buildings/faces.ts`
- Modify: `web/src/render/sprites/detail.ts`
- Modify: `web/src/render/primitives.ts`
- Modify: `web/src/render/world-palette.ts`
- Modify: `web/src/render/sprites/buildings.ts`
- Test: `web/tests/sprite-cache.test.ts`

**Interfaces:**
- Produces: 指挥中枢、精炼厂、光伏、燃料合成、研究实验室五项完整 `BuildingArt`；body 无 time/view，motion 保留原动态。
- Consumes: Task 5 cache 与 `drawBuilding`，Task 1/3 色板与材质。

- [ ] **Step 1: 扩展 registry 测试**
  对上述五个 key 断言 `body` 为函数、bounds 包含地面锚点且尺寸有限、healthY<0；先运行并确认因 legacy body=null 失败。

- [ ] **Step 2: 重做共享实体语言**
  HULL 改陶瓷白/石墨/橙，primitives 形成暖顶面/冷暗面，plinth 减薄黑裙边；固定细节留在 body，信号使用 SIGNAL。

- [ ] **Step 3: 迁移五项资产**
  HQ/refinery 独立文件避免超 400 行；按 spec 表格保留大剪影。将灯带、输送、斗转、烟气等全部移入 motion，不为动态值增加 cache key。

- [ ] **Step 4: 验证与截图**
  Run: `npx vitest run web/tests/sprite-cache.test.ts && npx tsc --noEmit && npx eslint web/src web/tests && node scripts/check-file-length.mjs`
  Expected: PASS；实机检查五项建筑、施工/受损、缓存后动画，保存 `.tmp/art-group-a.png`。

- [ ] **Step 5: 提交**
  `git add web/src/render web/tests/sprite-cache.test.ts && git commit -m "feat: redesign colony landmark sprites"`

### Task 7: 建筑组 B——煤炭工业与轨道设施

**Files:**
- Modify: `web/src/render/sprites/buildings/industry.ts`
- Create: `web/src/render/sprites/buildings/industry-motion.ts`
- Modify: `web/src/render/sprites/buildings/orbital.ts`
- Create: `web/src/render/sprites/buildings/orbital-motion.ts`
- Modify: `web/src/render/sprites/buildings.ts`
- Test: `web/tests/sprite-cache.test.ts`

**Interfaces:**
- Produces: 煤矿、燃煤电厂、发射台、货运坪、机库、雷达阵列六项完整 `BuildingArt`。

- [ ] **Step 1: 扩展并运行失败测试**
  对六个新 key 断言完整 body/bounds；运行 scoped test，确认迁移前失败。

- [ ] **Step 2: 重做六项资产并拆 motion**
  按 spec 的大斗轮/锅炉高烟囱/八角发射坪/门式吊机/大拱机库/大抛物面重塑轮廓；斗轮、皮带、烟气、火箭高度与尾焰、吊车、舱门灯、雷达盘全部由 view/time 驱动且不缓存。

- [ ] **Step 3: 自动验证**
  Run: `npx vitest run web/tests/sprite-cache.test.ts && npx tsc --noEmit && npx eslint web/src web/tests && npx vitest run && node scripts/check-file-length.mjs`
  Expected: 全部 PASS。

- [ ] **Step 4: 实机动态验收**
  在 demo 的充足资源下研究所需科技并开启快速建造，建出六项；执行一次火箭发射，观察煤炭设备、货运吊车和雷达。Expected: 动画不冻结、不闪切，主体与 motion 不分离，发射进度语义不变。

- [ ] **Step 5: 提交**
  `git add web/src/render/sprites web/tests/sprite-cache.test.ts && git commit -m "feat: redesign industrial orbital sprites"`

### Task 8: 建筑组 C、单位与战斗效果

**Files:**
- Modify: `web/src/render/sprites/buildings/defence.ts`
- Create: `web/src/render/sprites/buildings/defence-motion.ts`
- Modify: `web/src/render/sprites/buildings.ts`
- Modify: `web/src/render/sprite-contract.ts`
- Modify: `web/src/render/sprites/detail.ts`
- Modify: `web/src/render/sprites/units.ts`
- Modify: `web/src/render/overlays.ts`
- Modify: `web/src/render/renderer.ts`
- Test: `web/tests/sprite-cache.test.ts`

**Interfaces:**
- Produces: 中继塔、轨道炮、防空炮、壁垒、维修站五项完整 art；全部 16 类 body 改为必填，删除 legacy adapter。

- [ ] **Step 1: 写最终 registry 失败测试**
  遍历 `BUILDING_KEYS`，断言 16 项都有 body、有效有限 bounds、healthY<0；Expected initial FAIL，因为最后五项仍是 legacy。

- [ ] **Step 2: 迁移防御与支持建筑**
  保留炮管朝向/充能、flak 后坐、雷达追踪、维修无人机与焊接点；body 只画固定底座和结构。

- [ ] **Step 3: 删除迁移兼容层**
  `BuildingArt.body` 改为必填，删除 RAW/legacy 包装和不再使用的 `withStates`；缓存路径覆盖全部已建成建筑。

- [ ] **Step 4: 重做单位与战斗反馈**
  七类单位保留剪影，玩家陶瓷白/青、敌方暗红/红；弹道、命中、爆炸、施工、受损、选中和放置反馈按 spec 使用 SIGNAL，无全屏泛光。

- [ ] **Step 5: 自动与战斗验证**
  Run: `npx vitest run && npx tsc --noEmit && npx eslint web/src web/tests && node scripts/check-file-length.mjs && node scripts/check-assets.mjs`
  Expected: 全部 PASS；`?demo=1&rush=1&debug=1` 实际交战，炮塔/受损/血条/爆炸/选中均正常，保存 `.tmp/art-combat.png`。

- [ ] **Step 6: 提交**
  `git add web/src/render web/tests/sprite-cache.test.ts && git commit -m "feat: complete aerospace combat art"`

### Task 9: 联合视觉、交互与性能验收

**Files:**
- Modify only defects found in `web/src/**` or `web/tests/**`; no new subsystem.

**Interfaces:**
- Consumes: Tasks 1–8 的完整实现。
- Produces: 可发布的视觉候选版本与 `.tmp` 验收证据。

- [ ] **Step 1: 双视口与地貌检查**
  内置浏览器以 1280×720 和 1920×1080 检查同 seed 开场、自然/水域/雪地、跨 0/10239 接缝和快速平移；无破版、持续 cold chunk 或烘焙缝。

- [ ] **Step 2: 全资产交互检查**
  研究全部所需科技、启用充足资源与快速建造，建出全部 16 类并逐一点击；至少点击一个单位。核对 footprint、ghost、selection、healthY 和实际画面，无锚点偏移。

- [ ] **Step 3: 全动态状态检查**
  覆盖施工、受损、维修、炮塔交战、雷达跳转和火箭发射；确认缓存只冻结静态主体，所有动态状态仍响应 snapshot。

- [ ] **Step 4: 性能与资源检查**
  页面保持可见，预热后 demo 与 rush 交战各观察 ≥10 秒；debug FPS ≥55，无持续 cold chunk。Network 无图片/字体/外部请求，地形预算未提高，sprite cache 测试仍证明 8 Mpx 上限。

- [ ] **Step 5: 修复并复验发现的问题**
  每个缺陷先定位原因，修复后重跑对应 scoped 测试和本任务相关场景；不得通过降低对比度、FPS 或缓存预算阈值来验收。

- [ ] **Step 6: 提交**
  `git add web/src web/tests && git commit -m "fix: polish aerospace visual integration"`（无缺陷则不创建空提交）。

### Task 10: 文档、完整 CI、打包与发布

**Files:**
- Modify: `docs/superpowers/specs/2026-10-24-aerospace-visual-redesign-design.md`
- Modify: `docs/design.md`
- Modify: `docs/architecture.md`
- Modify: `docs/decisions.md`
- Modify: `README.md`
- Modify: applicable historical `docs/*prompt*.md`
- Replace from real captures: `docs/screenshot.png`, `docs/screenshot-debug.png`, `docs/screenshot-combat.png`, `docs/screenshot-1280.png`

**Interfaces:**
- Produces: 当前规范、真实新版截图、两个 Windows exe、远端 main 与绿色 CI。

- [ ] **Step 1: 同步规范**
  将设计状态改为已批准/已实施；新增 D-18 记录浅 HUD/深视窗与 body/motion 决策；更新 README 视觉不变量、architecture 的缓存/加建筑流程和旧注释。历史 prompt 只加醒目的旧版参考说明并指向新 spec。

- [ ] **Step 2: 更新真实截图**
  用最终构建捕获并替换四张文档截图，逐张媒体读取确认；PNG 仅位于 docs，不进入 web。若 Chrome 不可用，使用系统 Edge 的 Playwright `executablePath` 或内置浏览器真实捕获，并明确记录方式，不用旧图冒充新版。

- [ ] **Step 3: 停止预览并跑完整标准 CI**
  Run: `node scripts/ci.mjs`
  Expected: 15 步全部 PASS，双 exe 生成；不得以 scoped 测试代替。若失败，修复后从完整命令重跑；若修复改变画面，重新执行 Step 2 的截图与检查。

- [ ] **Step 4: 浏览器 launcher 烟测**
  启动 `dist-exe/APHELION-0.1.0a1-browser.exe --port 5190 --no-open`，用内置浏览器打开对应 loopback 的 demo/debug，确认启动、画面与交互后停止本次进程。

- [ ] **Step 5: WebView2 桌面烟测**
  启动 `dist-exe/APHELION-0.1.0a1.exe --seed 1602900180 --debug`，确认原生窗口而非仅进程存在；捕获并读取实际窗口画面，检查启动和一次交互，然后正常关闭。无法验证必须明确报告，不能写“通过”。

- [ ] **Step 6: 最终审查与提交**
  Run: `BASE=$(git log -1 --format=%H --grep='^docs: plan aerospace visual redesign$'); git diff --check "$BASE" && git status --short && git diff --stat "$BASE"`
  审查本计划全部改动、生成物与文档截图，无意外文件后提交文档/修复/截图；确认工作树干净。

- [ ] **Step 7: 推送并确认远端**
  `git push origin main`，随后 `gh run list --limit 1` 定位新提交，`gh run watch --exit-status <run-id>`。Expected: 远端 CI 绿色；否则诊断、修复、重新完整验证并推送。
