# 2026-10-26 · T1 HUD 信息反馈

## 范围

完成 `2026-10-21-game-redesign.md` 的迭代2候选 ①–③。只改 TypeScript 表现层与测试，不改 Rust 规则、协议、时代推进或平衡数值。

## 完成

- 时代面板：`web/src/content/era.ts` 新增 `eraAllowsKey`；`web/src/ui/hud.ts` 按雷达阵列（T2）、研究实验室（T2）、货运坪（T3）控制星区态势、科技树、星际航线的显隐。隐藏面板停止更新，雷达重新显示时重新测量尺寸。
- 放置反馈：`web/src/content/placement.ts` 补齐 `REASON_*` 0–9 中文表；`web/src/app/placement.ts` 在开始放置、悬停变化和新快照到达时刷新权威查询；建造栏显示原因，窄栏单行省略并保留完整悬浮文案。
- 事件日志：`web/src/ui/panels/event-log.ts` 的去重键从 `(kind,a,b)` 扩为 `(kind,a,b,tx,ty)`，同波不同落点分别保留，同一位置重复事件仍去重。
- 回归测试：`web/tests/t1-hud.test.ts` 覆盖面板解锁时代、全部放置原因索引与未知码、同参数不同落点的事件身份。

## 验证

- `node scripts/ci.mjs --web` 在 `vcvars64` + 工作区 Temp 环境下全绿：typecheck、ESLint、13 个测试文件共 56 项测试、Vite 构建、文件长度/资产/BOM 守卫、两个 Windows exe 打包。当时的 `--web` 实现仍包含打包，该问题后续已由 [CI 模式修正](2026-10-26-ci-web-mode.md) 关闭。
- `dist-exe/APHELION-0.1.0a1-browser.exe --port 8137 --no-open` 实跑成功，构建戳 `1026-2131`。1280×720 下 T1 三个无效面板隐藏；真实点击光伏阵列并悬停中枢后，放置栏显示“地块已被占用”，无文案溢出。
- `node scripts/screenshot.mjs --debug --wait 140000 --out .tmp/t1-first-wave.png --stats`：控制台零错误；02:15 同屏保留两条地面掠袭记录，01:55 波次预警也在，证明同波两落点未再合并。
- 本次仅重编译导致 `web/public/oc.wasm` 字节变化，已恢复为 HEAD 版本；没有内核行为改动要提交。

## 后续记录与遗留

- `rush` 事件丢失已于 2026-10-26 按 D-19 修复，见 [宿主 step 快照事件保留](2026-10-26-step-events.md)。
- T1 平衡仍需人工试玩，T2 石油/化工仍待设计。

## 接续

代码与本文档均未提交；原有未跟踪文件 `dungeon-village-prompt.md` 未触碰。
