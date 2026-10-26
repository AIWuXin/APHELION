# 2026-10-26 · 暂停与掉帧下的事件交付（D-20）

## 范围

承接 D-19，修复暂停、后台标签和渲染掉帧时快照事件仍可能不到达 HUD 的问题。不改变仿真规则、协议布局或渲染频率。

## 定位过程

- `EventLogPanel.consume` 原按 tick 判重；暂停时同 tick 新快照会被跳过。
- 真实 `oc.wasm` 暂停建造测试证明内核与解码正常后，实机仍漏日志，进一步定位到 rAF 时序：Transport 的下一份快照可能先替换带事件的快照，HUD 尚未消费就被覆盖。

## 修复

- `web/src/ui/panels/event-log.ts` 改为按快照对象身份判重：同对象重复渲染不消费，同 tick 新对象仍处理。
- `web/src/ui/hud.ts` 新增 `consumeEvents`；`web/src/app/app.ts` 在每次 `onSnapshot` 立即摄取日志、字幕和警报。rAF 更新保留同一入口，同对象不会重复消费。
- `docs/architecture.md` 与 `docs/decisions.md` D-20 已同步。

## 回归测试

- `web/tests/event-log.test.ts`：真实 `consume`，只替换 DOM 渲染；先在同 tick 新快照用例上失败，修复后通过。
- `web/tests/wasm-events.test.ts`：真实 WASM 在 tick 0 暂停并即时建造，快照包含建成事件；随后经真实解码与 HUD 消费器得到一条日志，下一空快照不重复。
- 定向 typecheck、ESLint、Vitest 均通过；最终完整 `node scripts/ci.mjs` 15 阶段全绿，前端 15 个测试文件共 58 项测试通过，WASM 与两个 exe 均已重建。

## 实机证据

开发页暂停于 `TICK 893`，开启资金和快速建造后放置光伏阵列。实体数 B3→B4、tick 保持 893，日志显示 `00:29 光伏阵列 建成`。这次复测覆盖了此前“建筑出现但日志为空”的真实失败路径。最终打包浏览器版 exe 也已启动，构建戳 `1026-2301`，画面与调试信息正常。

## 接续

T1 平衡与 T2 设计仍待后续；代码、测试与文档未提交，原有未跟踪 `dungeon-village-prompt.md` 未触碰。
