# 决策记录 / Decisions

每条记录三段：**改了什么 / 为什么 / 影响是什么**。规范里「默认值」的偏离都在这，
「不变量」的冲突裁决也在这。编号 N-xx 为默认值偏离，D-xx 为方向性决策，C-xx 为冲突裁决。

---

## C-01 · 光源方向 vs 三面明度顺序（不变量内部冲突）

**改了什么**：`LIGHT = { top 1.00, left 0.86, right 0.68 }` —— **屏幕左面**受光、**右面**背光，
接触阴影统一偏右下。

**为什么**：规范同一句里既要求「统一左上光」又要求「顶/右/左 ≈ 1.0/0.86/0.68」。在 2:1 等距
里 `screen_x = (x−y)·32`，左上光的水平分量指向 −x，于是法线指向 **+y 的面（屏幕上落在左侧）**
才是受光面；阴影偏右下也只可能由左上光产生。若严格按「右面 0.86 更亮」执行，就必须把光源放到
右上，那么阴影应偏左下 —— 与另一半要求直接冲突，并且与参考图里圆柱高光偏左的观察不符。

**影响**：三档明度级差 1.0 / 0.86 / 0.68 **完整保留**（这是风格的可辨识结构），只交换左右归属。
全图形体共享一套 `LIGHT`，因此没有一处需要单独调参。`docs/design.md §2.2` 与
`tokens.ts` 注释都写明了这条裁决。

---

## D-01 · wasm 桥接用裸 `extern "C"`，不用 wasm-bindgen / wasm-pack

**改了什么**：`crates/bridge-wasm` 导出 12 个 `#[no_mangle] extern "C"` 函数
（`oc_init / oc_step / oc_apply / oc_snapshot_ptr|len / oc_boot_ptr|len / oc_query_place / …`），
TS 侧用 `WebAssembly.instantiate` + 手写 `Uint8Array` 视图；构建只需
`cargo build --target wasm32-unknown-unknown`，产物 76 KiB。

**为什么**：协议本来就是二进制，桥接的全部工作就是「把字节写进线性内存 → 调用 → 从线性内存读回」。
wasm-bindgen 会为同一件事引入 JS glue 生成、版本配对和 wasm-pack 安装，是本项目里最容易坏的一环。
裸 ABI 让边界在一屏代码内可审计。

**影响**：正面——构建链极短、无版本漂移、CI 更快、边界无隐藏开销。负面——需要自己管内存
（`oc_alloc/oc_free`，且指针只在下次变更前有效，TS 侧立即 `slice()` 复制）。已封在
`WasmTransport.readBlob()` 一处。

---

## D-02 · postcard + 手写 TS 读取器 + 跨语言金标准固件

**改了什么**：Rust 用 `postcard`（varint + zigzag，无字段名）；TS 手写 `net/postcard.ts`
只实现本协议用到的子集。`cargo test -p oc-protocol|oc-content` 写出
`web/tests/fixtures/{snapshot,commands,boot}.bin` 与预期 JSON；
`web/tests/postcard.test.ts` 逐字段比对快照、**逐字节**比对命令编码、校验 boot 里的
`Vec<T>` 长度前缀与 `i8` 原始字节。

**为什么**：规范禁止每 tick JSON，也禁止手写协议类型。类型由 `ts-rs` 从未经手写的 Rust 结构
直接生成；但「二进制解码器」必须有人写，唯一可靠的防漂移手段就是让两侧对同一批字节做交叉校验。

**影响**：正面——解码器有了可执行的规格；`boot.bin` 测试当场抓到一个真 bug：我漏掉了
`Vec<u8>` 前的 varint 长度前缀，导致海拔数组整体错位（`-112` 这种值）。负面——协议字段变更
需要多跑一步 fixtures 生成；已写进 `architecture.md §5`。

---

## D-03 · 地表调色：矿质低饱和，而不是参考图的饱和草地

**改了什么**：8 种材质全部低饱和、压暗：玄武岩 `#2b3235`、风化表土 `#5d5950`、苔原毯
`#4a5a3c`、硅砂丘 `#7d7358`、卤水 `#123039`、混凝土坪 `#3a4144`、运输带 `#262b2c`、
晶簇地 `#463a5c`。饱和色只出现在能量（琥珀）、数据（青）、生机（绿）与敌方（红）。

**为什么**：不变量 5 要求「压深黑位 + 低饱和」。参考图的草绿/土黄饱和度明显高于这条要求；
逐像素临摹会同时违反不变量 5 与本任务的世界观（矿脉行星）。而且低饱和地表能让 HUD 的三种
强调色在世界里获得对应物（反应堆/发射台的琥珀、穹顶与数据链的青、实验室的绿），
「世界与 HUD 共用一套色板」于是成为事实而不是声明。

**影响**：正面——世界与 HUD 的语法统一；暗色 HUD 与地表的明度关系更稳（面板不飘）。
负面——初见时世界比参考图「冷」，因此靠**材质纹理差异**而不是色相差异来区分地表
（裂纹/草簇/涟漪/扇贝浪/伸缩缝/虚线/晶簇），并要求建筑上一定有 1–2 处琥珀或青色光点
把视线拉回强调色。

---

## N-01 · 地图尺寸与镜头：a0 的 44×44 边界钳制 → a1 的 10240² 环面

**改了什么**：a0 定的是 44×44 的矩形地图（投影后约 2816×1408 px），镜头纯正交平移、无缩放、
无旋转、无透视，WASD/拖拽平移并做边界钳制。a1 行星级迭代把世界改成 **10240×10240 瓦片的双轴
环面**：`crates/iso/src/grid.rs` 定义 `MAP_W` / `MAP_H`，`crates/iso/src/torus.rs` 统一定义
取模回绕、最短有符号距离与跨缝 footprint，`320×320` 个 32×32 区块按 `(seed, chunk)` 纯函数生成。
镜头移到 `web/src/app/camera-rig.ts`：平移按环面取模（`10239` 与 `0` 在屏幕上相邻），**不再有
边界钳制**；滚轮与 `+`/`-` 以光标为锚做 0.75×–2.5× 的纯正交缩放，`0` 复位到殖民地。
地形不再随 boot 一次交付，改为按视口流送区块（N-01 的镜头取景与 D-17 的地形传输是同一次迁移）。

**为什么**：a0 的理由是 44×44 在 1920 宽下只能看到约 1/3，禁止平移会让「建造→发射→防御」的
闭环无法观察。a1 的用户定案是「母星 1w×1w、循环滚动，99999 与 0 坐标贴着」，单星球尺度必须
靠区块生成与环面坐标才装得下。地图一旦没有边缘，「把菱形夹在视口内」的钳制就失去了对象；
镜头改为在环面上无限漫游，正交投影与无旋转仍然成立（不变量 1 约束的是**投影**，不是取景范围）。

**影响**：正面——行星尺度可连续漫游，跨接缝不跳变（距离一律走环面最短偏移），地形内存与世界
边长脱钩（内核 LRU 256 个区块、渲染画布像素预算 24 Mpx）。负面——a0 的 44×44 取景、截图机位与
旧回放全部失效；`zoom ≠ 1` 时 1px 棱线会出现非整数宽度（N-06 已记录取舍）。a0 的边界钳制代码
与其理由已删除，本条保留原文脉络，用来说明 a1 为什么改判而不是简单调参。

---

## N-02 · 字体：系统栈，不打包思源黑体

**改了什么**：`FONT.sans = "Noto Sans SC", "Source Han Sans SC", "Noto Sans CJK SC",
"Microsoft YaHei UI", "Microsoft YaHei", sans-serif`；等宽 `"JetBrains Mono", "Cascadia Mono",
"Consolas", "SF Mono", "DejaVu Sans Mono", monospace`。

**为什么**：零位图、零外部请求的要求延伸到字体——引入 webfont 就是一次外部资源加载，
且中文字体动辄 5–10 MB。Windows 自带微软雅黑、macOS 自带苹方/思源，中文不会乱码。

**影响**：正面——零外部请求、启动快、中文一定不乱码。负面——不同平台字形宽度略有差异，
因此：①字号用 px 固定；②英文副标题靠 `letter-spacing` 而不是靠字体自带字距；③宽字距标题
不参与自动换行；④CI 的截图固定在 Windows/Chrome 下，跨平台视觉差异属已知项。

---

## N-03 · 顶栏 34px / 右栏 336px / 瓦片 64×32（与默认值的偏差量）

**改了什么**：顶栏 34px（1080 的 3.15%，默认 3%）；右指挥栏 336px（1920 的 17.5%，默认 17%）；
瓦片保持 64×32；字幕条 30px；沙盒面板 322px。

**为什么**：32px 顶栏装不下 14px 中文标题 + 10px 英文副标题 + 数字的垂直呼吸；336px 恰好
容纳 2 列建造卡（每列 160px）而不产生第三列半截卡片。

**影响**：偏离量均在允许的 20% 以内。1280 宽时右栏降到 300px（媒体查询），
建造卡仍为 2 列，不破版。

---

## N-04 · 施工/选中的交互反馈：琥珀实底 + 施工骨架

**改了什么**：选中控件（页签、沙盒开关）用**实心琥珀填充 + 近黑文字**，而不是发光或描边；
建造中的建筑用「基座 + 线框桁架 + 琥珀扫描线」表现，高度随 `progress` 增长。

**为什么**：参考图的语言正是「实底琥珀 + 反白文字」，这是比 glow 更硬朗、更符合「哑光钢板」的
选中语义；而建造过程必须有过程反馈，但规范禁止大面积泛光，所以用骨架 + 1px 扫描线表达。

**影响**：正面——选中状态在深色面板里对比度极高，且完全没有发光（守住不变量 4）。
负面——琥珀实底面积受控（只在控件上），避免变成「大面积高饱和」。

---

## D-04 · 内容数据驱动 + 编译期完备（原创点）

**改了什么**：内容表放在 `crates/content`；`cargo test -p oc-content` 生成
`web/src/generated/content-keys.ts`（`BUILDING_KEYS` 等 `as const` 数组与对应联合类型）。
绘制注册表声明为 `Record<BuildingKey, BuildingPainter>`。

**为什么**：规范同时要求「新增建筑只改 content 表 + 渲染注册」与「类型系统在编译期强制完备」。
把表变成 TS 字面量联合类型，两者就能同时成立：漏画一个建筑 = tsc 报错，而不是运行时空白。

**影响**：正面——加建筑的流程是两次编辑 + 一次 codegen，编译器保证不漏；内容顺序即 wire id，
不存在「键名与序号不同步」。负面——`content-keys.ts` 是生成物，必须在 CI 里与 Rust 表同步
（`cargo test -p oc-content` 已内建于 CI 的 Rust 阶段）。

---

## D-05 · 状态哈希 = 「编码后哈希」

**改了什么**：每 tick 用 `hash = 0` 构造快照并 postcard 编码，对字节做 FNV-1a 得到哈希，
再带哈希编码一次作为下发帧。

**为什么**：手写 `hash_state()` 函数需要人工维护字段清单，新增字段忘记纳入是典型的静默 bug。
对编码后的整帧求哈希，天然覆盖所有可观察字段。

**影响**：正面——新增字段自动纳入确定性校验；`oc-sim-cli` 的两次运行比对因此可信。
负面——每 tick 多一次编码（约 10 KiB × 2 × 30/s，实测 step 耗时仍 < 1ms，可接受）。

---

## D-06 · 布局与交互：HUD 三段式 + 新增两个模块

**改了什么**：所有面板统一为「标题（中文 + 宽字距英文）→ 数据行（数值 + 细进度条）→ 控件」。
在默认组成之外新增：**星际航线 SHIPPING LANES**（三条航线的开关与吞吐）与
**事件日志 EVENT LOG**（由 `snapshot.events` 派生的表现层环形缓冲）。

**为什么**：默认 HUD 组成里「星际物流」只有小地图与 3 行冷却，玩家没有地方操作航线；
事件日志把「警报/交付/研究完成」串成可读的时间线，是 4 个系统共同产出的自然入口。
两者都遵守三段式、1px 语言与三色纪律。

**影响**：正面——物流闭环有了操作面；日志让副标题栏之外的信息可回溯。
负面——右栏内容变多，因此建造卡区可滚动（`oc-scroll`），保证 1080 高不溢出。

---

## D-07 · 心流选择：sandbox 开关与 AI 档位进入真实仿真

**改了什么**：`Policy.sandbox_flags` bit0 无限资金、bit1 快速建造；AI 档位通过**追加的**
`Command::SetAi { phase, strength }` 写入 `Policy`，由 director 系统读取。

**为什么**：规范把「∞ 资源 / 快速建造 / AI 三段选择器」列为 HUD 必备件，但没定义命令。
把 AI 档位塞进 `sandbox_flags` 会污染字段语义；协议允许「可扩展、不可删」，追加 variant
是最干净的扩展方式（已在 `architecture.md §5` 记录流程）。

**影响**：正向——演示时可以连点 400 合金不心疼、可以 3 秒建完看效果，也能把强度调到凶悍
看防御压力。负面——追加 variant 使既有回放的 variant 索引语义保持稳定（追加在末尾，不影响旧档）。

---

## D-09 · 打包成单文件 exe：自建 std-only 启动器，而不是 Tauri / Electron

**改了什么**：新增 `crates/launcher`（bin 名 `aphelion`，**零第三方依赖**）：
`build.rs` 把 `dist/` 里每个文件 `include_bytes!` 进二进制，运行时用 `TcpListener` 起一个
最小 HTTP/1.1 服务（含 `application/wasm` MIME、`HEAD`、405/404），再用
`cmd /c start "" <url>`（带 `CREATE_NO_WINDOW`）打开系统默认浏览器；Windows 下把控制台切到
UTF-8 代码页并设置窗口标题。`scripts/package-exe.mjs` 一条命令产出
`dist-exe/APHELION-0.1.0a0.exe`（0.42 MiB）。

**为什么**：需求是「浏览器里运行的单机 demo」，同时用户想要「双击就能开始」。三个候选：

| 方案 | 结论 |
|---|---|
| Tauri / Electron | 能给出原生窗口，但引入 WebView2 运行时依赖（Tauri）或 100+ MB 运行时（Electron），首编依赖数量与失败面都远超项目本体；而且它们都是外部 UI 壳层，与「零外部框架」的项目气质相反 |
| 只给 `dist/` + 一句 `npx serve` | 需要 Node.js 与命令行，不算「直接启动」 |
| **自建 std-only 启动器** | 单文件、无运行时依赖、构建只需 `cargo build`，且**跑的就是同一份 `dist/`**——浏览器里验证过的渲染路径没有被替换掉 |

**影响**：正向——一个 0.42 MiB 的 exe 就是完整游戏；`dist/` 与 exe 内嵌的是同一批字节，
不存在「打包后才出现的问题」；CI 只需多一条 `cargo clippy`（已包含在既有 workspace 全量检查里）
和一次 release 构建。负向——它是「启动器 + 默认浏览器」，不是自带窗口的桌面应用；
若将来一定要原生窗口，只需替换 `crates/launcher`（`dist/` 与协议不变），这也是把它单独做成
一个 crate 而不是塞进 `bridge-wasm` 的原因。另一处代价：`dist/` 不在时 `build.rs` 会退化成
空资源表（保证干净 checkout 也能 `cargo test`/`clippy`），此时 exe 会显示「请先打包」的页面。

> 后续（D-13）：本条的产物改名 `APHELION-0.1.0a0-browser.exe` 并降为主路径的兜底，
> `APHELION-0.1.0a0.exe` 现在是 `crates/desktop` 的原生窗口版；crate 拆成 lib + bin 供桌面端复用。

---

## N-05 · 版本号：semver `0.1.0-a0` / 展示 `0.1.0a0`

**改了什么**：`Cargo.toml` 与 `package.json` 用合法的 semver 预发布形式 `0.1.0-a0`；
对外展示统一用 `0.1.0a0`（`oc_protocol::PRODUCT_VERSION`、exe 文件名、控制台横幅、
窗口标题、`web/index.html` 标题与启动遮罩、`?debug=1` 调试层的 banner）。

**为什么**：Cargo 与 npm 都要求合法 semver，`0.1.0a0` 不是合法 semver（patch 后只能跟
`-prerelease` / `+build`），而用户希望看到的字面量是 `0.1.0a0`。两边各用各的形式，
并在 README 里写明映射关系，避免有人把 `0.1.0a0` 写进 `Cargo.toml` 后编译失败。

**影响**：正向——工具链开心，界面/产物名符合预期；`package-exe.mjs` 从 Cargo 版本自动推导
`0.1.0a0`，不需要手工同步两处。负向——两个写法并存，需要在这一条记录里解释；若以后发正式版
（`0.2.0`）则两者自动一致，这条偏离自然消失。

---

## N-07 · 开局地块：把殖民地「抬出湖盆」，并保证矿脉在脚下

**改了什么**：`crates/sim/src/mapgen.rs` 新增 `carve_colony_land()`：在出生点周围 19×19 的
范围里，把卤水 / 晶簇 / 硅砂改成玄武岩与风化表土交错的地块（硬边拼花，不是一整块），
海拔抬到 1；混凝土坪扩大到 11×10 并覆盖道路；在出生点 (+1..+6)² 强制铺一层富矿。
`generate()` 的顺序改为：地形分类 → 修整殖民地地块 → 铺路 → 铺混凝土坪 → 撒矿 → 撒装饰。

**为什么**：盆地引力让地图正中心必然低于卤水阈值，而出生点固定在 (19,19)，于是
**开局的三座建筑是泡在湖里的**——放大后非常明显（用户报告截图）。这不是渲染 bug：
新加的 `web/tests/wasm-map.test.ts` 证明「画出来的材质」与 `oc_query_place` 的判定完全一致
（每一格卤水/晶簇都拒绝建造），只是开局点本身选在了水里（10×10 窗口里 60 格是水面）。
顺带修了一个经济隐患：随机矿簇不保证落在预置精炼厂脚下，开局可能没有合金产出。

**影响**：正向——殖民地站在一整块混凝土坪上，周围有岸线（崖壁渲染器自动画出来），
开局经济稳定（精炼厂必然踩在矿脉上）。负向——地图不再是「纯自然」地形，
出生点是一处被平整过的工地，这反而符合「殖民前哨」的叙事；同时确定性哈希变了
（同 seed 仍双跑一致，CI 守卫不受影响）。

**新增守卫**：`web/tests/wasm-map.test.ts` 直接实例化 `oc.wasm`，逐格比对
`BootBlob.map.material` 与 `oc_query_place` 的结果，并断言开局 10×10 区域水面为 0、
只有已被三座预置建筑占据的格子被判定为不可建。这条测试把「渲染地图」与「仿真规则」
钉死在一起，以后再改地图生成不会静默退化成「建筑浮在水上」。

---

## N-06 · 缩放：滚轮 0.75×–2.5×（正交放大），并修正了平移边界

**改了什么**：新增 `web/src/app/camera-rig.ts` —— 相机的平移/缩放/边界钳制集中在此。
滚轮与 `+`/`-` 以光标为锚点缩放 0.75×–2.5×，`0` 复位到 100% 并重新框住殖民地；
`?debug=1` 时调试层显示 `ZOOM n%`，并暴露 `window.__ocCamera()` 便于自动化验证。

**为什么**：初版把「固定机位」实现成了「不可操作」，且边界钳制用错了坐标系——
按 `[0, (w+h)·32]` 而不是投影后的菱形边界 `x ∈ [−(h−1)·32, (w−1)·32]`，导致向右拖到
`x = 220` 就被夹住，地图左半边永远看不见；`WASD` 也被同一个错误钳制吃掉一半方向。
缩放同样是「看得清楚」的必要操作：44×44 的地图在 100% 下只能看到约 1/3 殖民地，
想点中 1×1 的炮塔很费劲。

**影响**：投影方式完全不变（仍是纯 2:1 正交、无透视、无旋转），所以不变量 1 成立；
缩放是画面外框的放大，不是 FOV 变化。代价：`zoom ≠ 1` 时画布整体被缩放，
1px 棱线会跟着变成 1.5px 等非整数宽度（在 100% 下像素级精确）。取舍是
「交互取景」优先于「任意缩放级别下的 1px 精确」，并在 `renderer.ts` 与
`docs/design.md` 注明；若评审要求严格 1px，把缩放档位限制为 `100%/200%` 即可
（两档下棱线仍为整数像素），只需改 `ZOOM_MIN/MAX` 与步进。

---

## N-08 · 品牌定名：APHELION / 远日点指挥终端（内部前缀 oc- 保留）

**改了什么**：对外品牌从「ORBITAL COMMAND / 星区指挥终端」改为 **APHELION / 远日点指挥终端**，
仓库名 `aphelion`，产物 `dist-exe/APHELION-<version>.exe`。用了 41 处、17 个文件的字符串
替换（`scripts/rename-brand.mjs` 一次性完成，只替换品牌 token，不碰 `orbital` 这个游戏设计词，
也不碰内部前缀）。**保留**的内部标识：crate 名 `oc-*`、CSS 变量 `--oc-*` 与类名 `.oc-*`、
wasm ABI 的 `oc_init` / `oc_step` / ...、`window.__ocCamera`。

**为什么**：
1. 用户定名 APHELION。它与游戏内第一条星际航线「远日点矿带 / APHELION BELT」同源——
   "离恒星最远的那一点"正是边境殖民地的处境，世界观自洽，而不是硬凑的词。
2. 原名的搜索面太宽："Orbital Command" 既是 RTS 里的常见技能名，也已有同名游戏条目，
   在 GitHub / 商店里都不利于被准确指认。
3. 内部前缀 `oc-` 出现在 60+ 个文件里（5 个样式表 266 处 `var(--oc-*)`、跨语言 wasm 契约、
   TS 类名），改它们属于纯机械改动、零用户可见收益，还会让二进制契约与样式表同时失效，
   收益/风险不划算。`docs/architecture.md` 里注明 `oc-` 读作 "core"，是稳定内部标识。

**影响**：正向——对外名称统一（窗口标题、控制台横幅、页面 title、启动遮罩、调试层 banner、
README、exe 文件名、文档标题全部一致）。负向——仓库里同时存在 `aphelion`（对外）与 `oc-`（对内）
两套前缀，需要这条记录解释；若将来要发布到 crates.io / npm，再单独做一次内部重命名提交。
`docs/master-prompt.md` 与 `docs/sci-fi-style-prompt.md` **保持原样**：它们是需求原文（规格），
不是产品文案。

---

## D-08 · 截图与验收工具链

**改了什么**：`scripts/screenshot.mjs` 用**本机已安装的 Chrome**（`playwright-core` 的
`channel: 'chrome'`）+ 进程内静态服务器截 1920×1080 图，并收集 console/pageerror 报错；
`?seed=` 固定世界，`?debug=1` 打开调试层。

**为什么**：「每个阶段都必须可运行、可截图」需要一个可重复、无外部下载的取证手段。
用已装的 Chrome 避免下载浏览器二进制（节省数分钟且离线可用）。

**影响**：正向——每轮改完都能在几十秒内看到真实画面并知道有没有 JS 报错；
截图同时作为「不变量逐条对照」的证据。负面——依赖本机 Chrome 路径，CI 机器需装 Chrome；
`playwright-core` 已加入 devDependencies。

## N-09 · 把 wasm 与生成类型入库，让 CI 拆成三个不互相牵连的 job

**改了什么**：`web/public/oc.wasm`（85 KiB）和 `web/src/generated/*.ts` 提交进仓库
（后者本来就已经提交，只是额度不清）。CI 从 2 个 job 改成 3 个：`rust`（内核门禁）、
`web`（纯 Node 表现层门禁）、`package`（Windows 上产出 exe）。rust job 里新增一条
`git diff --exit-code -- web/src/generated web/tests/fixtures`：只要有人改了 Rust 协议
却忘了重新生成，CI 直接失败并提示要提交哪些文件。

**为什么**：第一次跑 CI 时 web job 失败在 `curl https://sh.rustup.rs` 的网络抖动上——
它其实根本不需要 Rust，只是要去拿一个已构建好的 wasm。把这两个产物入库后：
web job 不再安装 Rust（更快、更稳、失败原因更单向）；rust job 仍然验证「源码能构建出 wasm」；
exe 必须在 Windows 上构建（否则拿到的是 Linux 二进制），所以单独一个 job。

**影响**：正向——CI 失败时能立刻定位到是哪一层的问题；web job 从「装 Rust + 装 wasm target +
构建」缩到纯 pnpm。负向——仓库里多了 85 KiB 二进制；且**改动 sim/protocol 后必须重建产物并
提交**，否则 web job 会用旧内核跑测试（这条写在 `architecture.md §8`；rust job 的
生成物漂移检查同时钉住协议侧与 `web/public/oc.wasm` 本体）。对 demo 仓库这是合理的取舍：可复现与 CI 稳定 > 仓库绝对纯源码。

---

## D-10 · 同屏轨道战舰上限 8 艘

**改了什么**：director 的轨道编队目标从无界公式 `wave / 2 + ai_phase` 改为
`min(wave / 2 + ai_phase, 8)`：同屏敌舰达到 8 艘后停止生成，已有舰体继续作为雷达接触点
留在轨道层。战舰血量改为读取 `World::unit_def(U_WARSHIP).hp`（即内容表
`units::UNITS[U_WARSHIP].hp`，表值 420），不再硬编码。

**为什么**：战舰位于 `LAYER_ORBIT`，而玩家武器只覆盖地面与低空层，永远打不到也永远不死；
旧公式让数量随波数线性增长，快照、雷达光点与状态哈希无谓地无限膨胀。给背景压力一个硬上界，
长局的内存与序列化开销才是有界的。

**影响**：正向——同屏轨道接触点有确定上界，长时间对局不再累积；血量与内容表单一来源，
以后调表不会与生成逻辑漂移。负向——高波数下轨道不再出现更多敌舰（它们本就不可交互）；
状态哈希的演变与旧版本不同，但确定性测试与玩法测试都是同一构建双跑对拍，不受影响。

---

## D-11 · 入库 wasm 的门禁：字节比较改为行为哈希比较

**改了什么**：删除 CI rust job 里「重建 `web/public/oc.wasm` 后 `git diff` 必须为空」的字节门禁，
换成行为门禁：`git show HEAD:web/public/oc.wasm` 取出**入库版本**（构建步骤会覆写工作区文件，
所以不能读文件系统），`scripts/wasm-hash.mjs` 以固定种子 `0x5EED_1234` 跑 300 个 idle 帧并打印
`oc_state_hash()`；原生侧由 `cargo run -q -p oc-sim-cli -- --idle 300` 打印同一格式的哈希，
两侧字符串不等即失败并提示 `pnpm run wasm`。`scripts/ci.mjs` 也在重建 wasm **之前**执行同一比较。
`rust-toolchain.toml` 继续钉 1.96.0。

**为什么**：wasm 二进制数据段会内嵌编译期的源文件路径。入库二进制里能直接看到
`crates\sim\src\world.rs`、`C:\Users\12591\.rustup\toolchains\stable-x86_64-pc-windows-msvc\...\thread\local.rs`
这样的 Windows 绝对路径（反斜杠）；Linux runner 用同一棵源码树构建时，同一批字符串会变成
`crates/sim/src/world.rs` 和另一条绝对路径。分隔符、用户名、rustup 位置全都不同，字节**永远**
不可能一致——这正是原门禁在 CI 上实测失败的原因。而状态哈希（D-05）是对「hash=0 的快照帧」
做 postcard 编码后取 FNV-1a，只取决于仿真状态，与宿主文件系统和路径无关，因此跨平台可比。

**影响**：正向——门禁检查的正是「入库 wasm 是不是当前内核」，不再被主机路径噪声打败；同一份
源码在 Windows / Linux 上必须给出同一个哈希，这也顺带把「确定性内核」的跨平台性变成 CI 事实。
负向——行为门禁只覆盖 `oc_init → oc_step × N → oc_state_hash` 这一条路径（导出表与渲染行为由
web job 的 `wasm-map.test.ts` 覆盖）；`oc_state_hash` 是新增 ABI（原有 `oc_hash` 保留并委托给它），
用缺少该导出的旧 wasm 跑脚本会明确报错并提示重建，而不是静默通过。

---

## D-12 · 开浏览器：解析默认浏览器 exe 后直接 spawn，`cmd /c start` 降为回退

**改了什么**：新增 `crates/launcher/src/browser.rs`（仍是 std-only，零第三方依赖）：读
`HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice` 的 `ProgId`，
再到 `HKCR\<ProgId>\shell\open\command` 取命令行模板，由纯函数 `extract_exe_from_command()`
取出 exe 路径（处理带引号路径；无引号时截到 `.exe`；`AppX…` ProgId 与含 `%VAR%` 的路径判定为
不可直接 spawn），然后 `Command::new(exe).arg(url).spawn()` 直接启动。注册表用
`extern "C"` 直调 `advapi32`（`RegOpenKeyExW` / `RegQueryValueExW` / `RegCloseKey`，两次调用
取长度），不引入 `winreg`。`main.rs` 的 `open_browser()` 变成回退链：直接 spawn → 旧路径
`cmd /c start "" <url>`（保留 `CREATE_NO_WINDOW`）→ 才打印手动访问提示；两条路径都成功时保持安静。
macOS / Linux 仍是 `open` / `xdg-open`。

**为什么**：用 built-in Administrator 双击 exe 时，`cmd /c start` 把 URL 交给 shell，再由 shell
的 broker 转发给浏览器，这次请求的完整性级别与**已以管理员权限运行的 Edge 实例**不一致，Edge 的
单例交接于是拒绝，弹出「现有实例正在以提升的权限运行，是否用普通权限重启」的对话框（用户实测）。
改成直接 spawn 后，浏览器进程**继承启动器的完整性级别**：提升的启动器起提升的浏览器子进程，与既有
实例同级，单例交接不再需要提权对话。

**影响**：正向——管理员（以及将来的非管理员）双击后浏览器正常打开，权限对话框不再出现；解析只读
注册表、无副作用，任何失败都安静回退到旧路径，行为不会比旧实现更差。负向——这段是 Windows 专有
逻辑（`#[cfg(windows)]`）；`AppX` 形态的默认浏览器（商店版 / UWP 关联）仍走 `cmd /c start`，那种
拓扑下同样的对话框理论上仍可能出现。`extract_exe_from_command()` 与 `resolve_exe()` 是纯函数，
8 个单元测试覆盖 Edge / Chrome / Firefox / 无引号 / 大小写与空白 / AppX / `%VAR%` / 畸形模板。

---

## D-13 · 桌面主路径：wry + tao 的 WebView2 原生窗口，浏览器启动器降为兜底

**改了什么**：新增 `crates/desktop`（包 `oc-desktop`，bin `aphelion-desktop`）：**tao** 0.37 建窗口、
**wry** 0.57 挂 WebView2，页面由自定义协议 `aphelion://localhost/` 直接从 `include_bytes!` 资源表返回
（无 HTTP 端口、无临时文件、无外部请求）。`crates/launcher` 拆成 lib + bin，桌面端复用
`oc_launcher::{assets, find_asset, run_http_server_with_query, open_browser}`：同一张资源表喂给自定义
协议，同一套 HTTP 服务与开浏览器逻辑做兜底。`scripts/package-exe.mjs` 改为双产物：
`APHELION-0.1.0a0.exe`（桌面版，0.80 MiB，主产物）与 `APHELION-0.1.0a0-browser.exe`
（D-09 的单文件启动器，0.43 MiB）。wry/tao 是 `cfg(windows)` 的 target 依赖，Linux CI 只编译 stub；
桌面 crate 的 `build.rs` 内嵌应用清单（`asInvoker` + `PerMonitorV2` + Win10/11 + comctl32 v6）、
VERSIONINFO 与 `assets/icon.ico`（由 `scripts/gen-icon.mjs` 生成并入库），窗口图标用
`assets/icon.rgba`。release 构建为 GUI 子系统（`windows_subsystem = "windows"`，不闪控制台）。

**为什么**：D-09 的「启动器 + 默认浏览器」在用户实测里有三个痛点，而且都不是加参数能解决的：

| 痛点 | 现象 |
|---|---|
| SmartScreen 拦截 | 未签名 exe 从网上下载后，双击先吃「Windows 已保护你的电脑」 |
| 权限链断裂 | built-in Administrator 账户下浏览器单例交接拒绝，弹「现有实例正在以提升的权限运行」（D-12 缓解了同一类问题，但没有根治「需要一个外部浏览器」这件事） |
| 手输端口 | 浏览器没被拉起来时，用户必须手动复制 `http://127.0.0.1:<端口>/` |

三个候选：

| 方案 | 结论 |
|---|---|
| **wry + tao** | 就是 Tauri 的底层本身：没有 tauri-cli、没有 `tauri.conf.json`、没有脚手架与前端框架假设，`Cargo.toml` 加两个依赖即可；WebView2 已是 Windows 10/11 标配，不额外分发运行时 |
| Tauri | 能力相同，但多一层 CLI + 配置 + 版本配对要维护；本项目只有 8 个 crate，壳层的失败面大于收益 |
| Electron | 自带 Chromium，单产物 100 MB 起，与「零运行时依赖」的项目定位直接冲突 |

**影响**：正向——双击即原生窗口，关窗即退出；没有端口、没有「浏览器没起来」的分支、没有权限对话；
exe 带图标与版本信息，在资源管理器里可辨识。负向——Windows 上多了 wry/tao 两个第三方 crate（其
传递依赖 `vswhom-sys` / `embed-resource` 需要 MSVC 的 `cl.exe` 与 INCLUDE/LIB，CI 里显式加了一步
`ilammy/msvc-dev-cmd`）；产物从 0.42 MiB 涨到 0.80 MiB。

**与 D-09 的关系**：D-09 否决 Tauri/Electron 的前提是「需求是浏览器里的 demo」，并把原生窗口列为
将来的可选项。需求变更成「Windows 桌面应用」后，**原生窗口成为主路径，D-09 的结论被部分取代**；
但 D-09 的另一半继续成立并成为这次的地基——std-only 的内嵌资源表 + 最小 HTTP 服务原样复用，
`APHELION-0.1.0a0-browser.exe` 就是 D-09 的产物本身，也是 WebView2 缺失或窗口创建失败时的自动回退。
D-09 结尾那句「若将来一定要原生窗口，只需替换 `crates/launcher`」正是本次做法：`dist/`、协议、
wasm ABI 一行未改。

**实测**：wry 0.57 在 Windows 上把 `aphelion://localhost/` 改写成 `http://aphelion.localhost/` 再交给
WebView2，但自定义协议 handler 收到的仍是**原始** scheme URI，因此 handler 只看 path
（`crates/desktop/src/protocol.rs`），导航白名单同时放行三种写法。窗口内 `oc.wasm` 实例化与渲染
实测通过（MIME 必须是 `application/wasm`，否则 WebView2 拒绝流式实例化）。**不做代码签名**：证书
要花钱且个人项目不必要，接受首次 SmartScreen 提示并在 README 里文档化。

---

## D-14 · 游戏重设计迭代1：煤资源、era/tier 双重门槛与 T1 地面掠袭

**改了什么**：按「母星 T1 = 金属 + 煤」的重设计定案——`Resources` 追加 `coal/coal_rate`，
`MapView` 追加煤层；新建筑采煤机（须拍煤层）与火电站（烧煤发电）**追加**进建筑表；光伏 18→6；
`BuildingDef` 追加 `tier`、`World` 新增 `era`（默认 1），放置校验对 `tier > era` 返回
`REASON_ERA`；era1 的导演不生成巡洋舰/登陆艇/破城者，改为在殖民地周围半径 24 格的环上确定性
生成掠夺者地面小队（角度由 director 流域掷出，深水跳过、浅水兜底；era≥2 恢复轨道空投逻辑）。
a1 的环面世界没有地图边缘，本条最初写的「从地图边缘生成」已随行星级迭代作废。
火电站采用「库存门槛 → 本 tick 烧煤才发电」模型（烧煤顺序按建筑数组序，确定性可复现）。

**为什么**：用户在实测前明确的设计阶梯（T1 金属+煤 → T2 石油 → T3 铝 → T4 钛/硅），并授权按此
实现 T1 可玩闭环；实验室/防空/发射台等封存到后续时代，让 T1 的节奏围绕「金属与煤两条腿 + 火电
压力」展开。时代门槛做进内核而不是只做前端隐藏，保证「命令面即规则面」。

**影响**：协议布局变化（旧回放/旧哈希失效，本次哈希迁移已记录在进展档案）；`sim-cli` 脚本局
显式 `set_era(4)` 以保留其对轨道/物流链的测试意图；era1 下前端隐藏燃料/研究位与越级建造卡，
demo 脚本按 era 跳步。物流 C 方案（半径内自由流动）在 T1 等价于全局库存，运输队机制推迟到 T3。

---

## D-15 · 指挥中枢 3×3：全表唯一最大占地作为「首都地标」

**改了什么**：B_HQ `footprint 2→3`；mapgen 保底矿脉移到中枢东侧、`clear_hub_footprint` 清掉中枢
占地上的随机矿/煤、混凝土坪以中枢中心铺 10×10；起家布局改用 `SiteRule::{Free,Deposit,Barren}`
（太阳能只落 Barren 空地）；清理了一批写死 2×2 的假设（爆炸中心、richness 缩放、HP 条高度、
雷达投影）。画法上中枢/精炼厂移入新模块 `landmarks.ts`（共享面几何 `faces.ts`），中枢按 3×3
画布重做为「指挥塔 + 悬挑指挥台 + 着陆坪」，精炼厂重做为「进料斗 + 铆接主罐 + 热光烟囱」。

**为什么**：用户实测反馈「中枢是 3×3 的，外观重做」。中枢作为剧本唯一预置建筑，给它全表唯一的
最大占地，既是视觉地标也是布局锚点；把尺寸假设改为读表，避免下次再踩同一类坑。

**影响**：确定性哈希迁移（idle300 `0xb7d86454→0xf125ee03`）；`structures.ts` 因 400 行护栏拆分，
地标画法独立成模块后「内容表 → 画法注册」的编译期完备性（D-04）不受影响；已知遗留——起家
精炼厂与中枢只隔 1 格视觉偏挤、开局合金收入变快，均待人工试玩后调。

---

## D-16 · 出生点必须在大陆上：八向内陆射线规则

**改了什么**：`find_home` 新增大陆门槛——候选点八条罗盘射线各走 128 格（步长 8，16 采样），
一条射线 ≥14/16 为陆地才算「内陆方向」，8 条里须 ≥5 条达标。海岸合格（内陆半边全开），
小岛永不入选。检查顺序先大陆后矿（射线纯噪声比富矿场便宜且第四败即退），搜索环 48→96
（半径 192→384）以覆盖「星心落进洋盆」的种子；回退链 = 有矿大陆点 → 无矿大陆点（保底矿体仍在）
→ 第一块干地（着陆抬升填海）→ 星心。家选代码从 `mapgen.rs` 拆进 `mapgen/home.rs`
（400 行护栏），公开常量与 `find_home` 经 `mapgen::` 再导出保持路径不变。

**为什么**：玩家实测出生在离岸小岛/海岸线上，四面环海无法向内陆发展；用户明确「不能是小岛，
必须在大陆，至于是不是海岸无所谓」。螺旋扩到 384 格后，5 个测试种子（含 0xDEADBEEF 这类
星心近洋的种子）全部找到 5+ 内陆射线的家。

**影响**：确定性迁移——多数种子的家位置移动，旧回放/存档失效；idle300 `0x02f72b56→0x7c540e6f`，
chunk 生成摘要 `0xD8CE_688B→0xBAEE_0655`（家所在 chunk 的着陆叠加随之搬迁，星球其余部分不变）。
新增契约测试 `home_always_sits_on_a_continent`（5 种子 × 8 射线）；最差启动成本约
18k 候选 × ≤128 次纯噪声采样（含早退），实测启动无感。

---

## D-17 · 协议升 v2：MapView 破坏性重写，地形改按区块流送

**改了什么**：`PROTOCOL_VERSION` 从 1 升到 2（`crates/protocol/src/version.rs`）。`MapView` 从 a0
的全图数组 `{ w, h, material, height, decor, deposit, coal }` 改成行星参数
`{ seed, width, height, chunk_size, start_tx, start_ty }`；地形五数组移入新的 `ChunkView`
`{ cx, cy, terrain, decor, elev, ore, coal }`（每个 32×32），由新增的 `oc_chunk(cx, cy)` /
`oc_chunk_len()` 两个 ABI 按需取。`BootBlob` 仍是 `{ protocol, seed, catalog, map }`，但 `map` 不再
携带任何地形字节；桥接导出从 16 个增至 18 个（新增 `oc_chunk` / `oc_chunk_len`）。
`web/src/generated/` 与 `web/tests/fixtures/` 全量重生成，旧 `boot.bin` 不再可解。

**为什么**：行星是 10240×10240 = 104,857,600 格。a0 的 `MapView` 把 5 个全图数组塞进一次 boot：
按 material / decor / deposit / coal 各 1 字节、height 1 字节算约 500 MB，既超出 wasm 线性内存的
舒适区，也让每次启动都要序列化整颗星球；而地形本来就是 `(seed, chunk)` 的纯函数，客户端只需要
看得见的部分。把「地形传输」从 boot 里拆出来，启动载荷变成常数级，内存上限改由内核 LRU 与渲染
像素预算决定，而不是星球面积。协议号必须跟着破坏性布局一起升，否则新旧两侧会用同一组字节解出
不同含义。

**影响**：正向——boot 从「整颗星球」缩到参数表；内核缓存 256 个区块、前端每帧 ≤4 次 `oc_chunk`，
启动时间与常驻内存不再随地图边长增长；旧客户端被 `oc_init` 返回的版本号挡在 `CLIENT_PROTOCOL`
之前（TS 抛 `oc.wasm: protocol …, client expects 2`），缺 `oc_state_hash` 的旧 wasm 也会被
`scripts/wasm-hash.mjs` 明确拒绝。负向——**这是一次契约断裂**：a0 的所有回放、旧状态哈希与旧
`boot.bin` 全部失效，`MapView` 的 TS 类型、解码器与渲染层必须同步重写；任何仍按「全图数组」读取
`MapView` 的下游代码都会在编译期或解码期失败。这是本迭代唯一一次主动放弃向后兼容，理由是新世界
尺寸下旧布局已无法成立；今后协议仍按「只在枚举末尾追加」扩展，不再重演全量重写。
