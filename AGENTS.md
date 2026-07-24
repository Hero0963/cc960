# AGENTS.md — 給 AI coding agent 的接手指南

> 本檔給自動化助理（Claude Code / Codex / Copilot 等）。人類貢獻者請看 [CONTRIBUTING.md](CONTRIBUTING.md)。
> 最後更新：2026-07-25

## 0. 這個專案是什麼

cc960 ＝ 借鑑 Chess960 的中國象棋變體：**走法規則完全不變，只隨機化開局擺放**，合法開局 339,484 種。
本 repo 含：走法引擎、開局產生器＋編號系統、單檔演示頁、枚舉驗證腳本、無頭 DOM 測試。

**三份文件的分工**（改東西前先確認要動哪一份）：

| 檔案 | 角色 |
|------|------|
| `docs/spec.md` | **規格正本**。規則、編號系統、檢定、期望數字都以此為準 |
| `docs/rationale.md` | 為什麼這樣設計（問題數據、方案比較、風險）。改設計理由才動 |
| `README.md` | 對外門面（大眾讀者）。數字或玩法有變才動 |

## 1. 動手前必讀

1. `docs/spec.md` 全文（尤其 §1 擺法規則、§2 檢定、§3 編號系統、§5 驗證基準）。
2. 要改的那個檔案的檔頭註解。
3. **不要憑記憶開工**：所有關鍵數字（339,484／216／146／3872／44）都以 `docs/spec.md §5` 為準，別自己推。

## 2. 不可破壞的不變量（違反 = 這次改動錯了）

| 不變量 | 怎麼驗 |
|--------|--------|
| 紅黑點對稱：黑 `(9−r, 8−c)` 與紅 `(r,c)` 同型異色 | `npm run count` 的「點對稱抽驗違反格數 = 0」 |
| 標準開局在合法池內，編號 3872，紅方 44 著 | `npm run count` 前三行 |
| 走法引擎行為（蹩腿、塞眼、照面、隔子吃、過河橫走） | `npm test`（走子／吃子／悔棋項） |
| `src/rules.js` 不得依賴 `src/setup.js` | 單向相依：setup → rules。反向 import 一律拒絕 |
| 兩種執行環境都要能跑：Node（require）＋瀏覽器（全域 script） | `npm run count`（Node）＋ `npm test`（jsdom） |
| `docs/index.html` 是建置產物 | 只能由 `npm run build` 產生，**永遠不要手改** |

## 3. 標準工作流程

```bash
npm install                # 首次；只裝 jsdom
# 改 src/ 或 docs/spec.md ...
npm test                   # build ＋ 16 項 DOM 測試（每次改完都要跑）
npm run count              # 只要動到 setup.js 的規則／檢定就必跑（約 20–25 秒）
```

**改規格的完整 SOP**（順序不能顛倒）：

1. 先改 `docs/spec.md`（規格正本），寫清楚改了什麼、為什麼。
2. 改 `src/setup.js` 實作。
3. `npm run count` → 拿到新的合法局面數與淘汰分解。
4. 用新數字更新：`docs/spec.md §5 驗證基準`、`§7 版本歷程`（加一列）、`src/shell.html` 文案、`README.md` 關鍵數字表。
5. `npm test` → 測試裡的期望值（3872／44／216／146／#122／#21）若隨規格改變，一併更新。
6. 全綠才算完成。

## 4. 常見任務地圖

| 任務 | 動哪裡 |
|------|--------|
| 改擺法規則（象位、兵形、炮位…） | `src/setup.js` 的 `E_POINTS`／`decodeId`／`setupFromId` ＋ 編號系統可能要重算 |
| 改首著檢定 | `src/setup.js` 的 `quietStartCheck()` |
| 修行棋 bug（走法錯、將軍判斷錯） | `src/rules.js`；先在 `test/test-dom.js` 加一項會失敗的測試 |
| 改演示頁外觀／文案 | `src/shell.html`（**不是** `docs/index.html`） |
| 改演示頁互動 | `src/ui.js` |
| 新增統計 | `scripts/stats.js` |
| 新增一種局面池 | `src/setup.js` 加 `xxxCandidates()` ＋ `src/ui.js` 的 `LISTS`／`MODE_LABEL` ＋ `src/shell.html` 的 `<select>` |

## 5. 程式慣例

- 純 ES2020，**零執行期相依**；不要引入前端框架、bundler 或 TypeScript。
- 演示頁必須維持**單檔、可離線開啟、無外部資源**（GitHub Pages 直接吃 `docs/index.html`）。
- 註解用繁體中文，寫「為什麼」而非「做了什麼」；棋類術語用棋手講法（蹩馬腿、塞象眼、照面）。
- `makeMove()` 回傳新棋盤，**不 mutate** 傳入的盤面；沿用這個慣例。
- 效能敏感處（全空間枚舉 139 萬局）不要塞進不必要的物件配置；`legalCaptures()` 是刻意的快路徑。
- 路徑命名一律 ASCII、lowercase kebab-case。

## 6. 禁止事項

- ❌ 手改 `docs/index.html`（下次 build 就被覆蓋）。
- ❌ 只跑測試沒跑 `npm run count` 就宣稱規則改動完成。
- ❌ 在文件裡寫沒實測過的數字；不確定就標「待補」。
- ❌ 把 `node_modules/` 或個人環境路徑寫進程式或文件。
- ❌ 未經授權 commit／push／開 PR。

## 7. 回報格式

完成任務時，回報要包含：改了哪些檔、`npm test` 與（若適用）`npm run count` 的實際輸出關鍵行、以及有沒有更新對應文件。**沒跑就說沒跑，不要推測結果。**
