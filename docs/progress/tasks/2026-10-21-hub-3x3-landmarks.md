# 中枢 3×3 + 地标画法重做（2026-10-21）

状态：**完成，已验收**。来源：用户实测反馈「中枢 3×3，中枢/精炼厂外观重做」。

## 改动要点

- `buildings.rs`：B_HQ `footprint 2→3`（全表唯一最大占地，有断言）；其余字段不动。
- mapgen/起家适配：保底矿脉移到中枢东侧 6×6（不再压中枢）；新增 `clear_hub_footprint` 清掉中枢 3×3 上的随机矿/煤；混凝土坪 10×10 以中枢中心铺开；起家太阳能只在 Barren 空地（不压矿/煤），精炼厂取最近有矿点；`find_free_site` 布尔参数升级为 `SiteRule::{Free,Deposit,Barren}`。
- 顺带修正的 2×2 硬编码假设：爆炸中心 `size/2`、精炼厂/采煤机 richness 按 `def.footprint`、HP 条高度、雷达 blip 投影。
- 画法重做（`landmarks.ts` 新模块，共享面几何 `faces.ts`；structures.ts 因 400 行护栏只留 solar/fuel/lab）：
  - 中枢（3×3）：装甲坪+琥珀角墩；三错落低盒带青色窗带；塔身+27 宽悬挑指挥台；琥珀指挥灯环（巡回灯+呼吸）；天线桅杆+呼吸 beacon；着陆坪人字纹+三级台阶。
  - 精炼厂（2×2）：深色进料斗朝外、铆接主罐、热光排气烟囱、输送坡道带爬升矿粒；金属琥珀色系 vs 采煤机炭黑系。
- 验证：cargo 全绿 + 双跑哈希 `0x4a2333c3` 一致 + wasm 闸门 `0xf125ee03` + `node scripts/ci.mjs` 15/15 PASS；Playwright 截图零 console error（`.tmp/hub-after.png` / `.tmp/refinery-after.png` / `.tmp/overview-after.png`）。
- 哈希变化（预期，旧回放失效）：idle300 `0xb7d86454→0xf125ee03`；脚本局 `0x1ff86772→0x4a2333c3`。

## 遗留

1. 起家精炼厂与 3×3 中枢只隔 1 格，视觉偏挤（深度排序正确）；要留白需在 `seed_colony` 加最小间距。
2. T1 开局节奏变快：脚本局合金 +57→+137/min（第二座精炼厂吃到满矿）。非回归，待人工判断。
3. 400 行护栏导致地标画法独立成 `landmarks.ts`；若要回 `structures.ts` 需先放宽护栏。
