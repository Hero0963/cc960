# cc960 架構指南

> 這份講**程式怎麼組起來的**：分幾層、每個模組負責什麼、核心函式是什麼、資料怎麼流。
> 規則與數字的正本是 [spec.md](spec.md)；開發流程與 PR 慣例見 [../CONTRIBUTING.md](../CONTRIBUTING.md)。
> 最後更新：2026-07-25

---

## 0. 心智模型

整個專案只有 **1,021 行 JavaScript**，零執行期相依。可以用一句話理解：

> **一副普通的象棋引擎（`rules.js`）＋ 一個「把整數編號變成開局擺法」的產生器（`setup.js`）。**

這兩者是**單向相依**的：`setup.js` 用 `rules.js`，反過來絕對不行。
`rules.js` 完全不知道「隨機開局」這回事——它就是一副標準象棋，換掉起始盤面照樣運作。
**這個分界是整個設計的地基**，破壞它等於讓走法引擎與變體規則糾纏在一起。

---

## 1. 分層

```
                       ┌─────────────────────────────┐
  展示層                │ shell.html  外殼：HTML/CSS/文案 │
                       │ ui.js       SVG 棋盤、互動      │
                       └──────────────┬──────────────┘
                                      │ 只呼叫全域函式
                       ┌──────────────▼──────────────┐
  變體層                │ setup.js                     │
                       │  編號系統 ＋ 擺位產生 ＋ 首著檢定 │
                       └──────────────┬──────────────┘
                                      │ 單向相依（反向 import 一律拒絕）
                       ┌──────────────▼──────────────┐
  規則層                │ rules.js                     │
                       │  走法／吃法／將軍／合法著法      │
                       └─────────────────────────────┘

  工具（不參與執行期）：scripts/build.js  scripts/count.js  scripts/stats.js  test/test-dom.js
```

---

## 2. 模組逐一說明

### 2.1 `src/rules.js`（169 行）— 走法引擎

**職責**：一副標準中國象棋。**與隨機開局完全無關**，把它單獨拿去用也可以。

| 核心函式 | 說明 |
|---------|------|
| `emptyBoard()` | 10×9 全 `null` 棋盤 |
| `pseudoMoves(bd, r, c)` | **最大的一支**（約 68 行）：該子的偽合法走法。蹩馬腿、塞象眼、炮的隔子吃、兵過河橫走、士象不出界都在這裡 |
| `isAttacked(bd, tr, tc, color)` | `color` 方是否攻擊該格（**不含照面**） |
| `kingsFacing(bd)` / `inCheck(bd, color)` | 照面 ／ 被將（`inCheck` 含照面） |
| `makeMove(bd, r, c, rr, cc)` | **回傳新棋盤，不 mutate 傳入的盤面** ← 全 codebase 沿用這個慣例 |
| `legalMoves(bd, color)` | 全部合法著法（`pseudoMoves` 逐一驗自將後過濾） |
| `pairs(arr)` / `C_PAIRS` | 組合工具，給編號系統用 |

**常數**：`RED = 0`、`BLACK = 1`；`VAL = { R:9, C:4.5, N:4, B:2, A:2, P:1, K:1000 }`
（`VAL` **只用於首著檢定比大小**，不是引擎評估值。）

**輔助**：`inBoard` / `inPalace` / `ownSide` / `findKing`。

### 2.2 `src/setup.js`（188 行）— 隨機開局產生器 ★ 專案核心

**職責**：整數編號 ⇄ 開局盤面，加上合法性檢定。三件事：

**(1) 編號系統**——混合基數（mixed-radix），把五個欄位打包成一個整數：

| 常數 | 值 | 意義 |
|------|-----|------|
| `E_POINTS` | `[[0,2],[0,6],[2,0],[2,4],[2,8],[4,2],[4,6]]` | 象的「原軌道」7 點：c1,g1／a3,e3,i3／c5,g5 |
| `BACK_ALL` | `[0,1,2,6,7,8]` | 底線非九宮路 a,b,c,g,h,i |
| `PAWN_FILES` | `[0,2,4,6,8]` | 兵的 5 路 a,c,e,g,i |
| `GROUPS` / `OFFSETS` | 21 組 | 依象位分組（各組大小不同，用前綴和定位） |
| `RAW_TOTAL` | **1,389,312** | 編號空間 |

| 核心函式 | 說明 |
|---------|------|
| `decodeId(id)` | 編號 → `{ ePts, hFiles, rFiles, cFiles, pMask }`；越界回 `null` |
| `setupFromId(id)` | 編號 → 棋盤；**結構衝突（炮或進兵疊上象位）回 `null`** |

**(2) 首著靜置檢定**

| 核心函式 | 說明 |
|---------|------|
| `legalCaptures(bd, side)` | **只生吃子著法**再個別驗自將——刻意的快路徑，比全合法著法快一個量級。全枚舉 139 萬局時這是效能關鍵 |
| `quietStartCheck(bd)` | → `{ ok, why?, detail? }`。任一首著吃子須「有根且不虧」或「對稱可回應」 |
| `checkId(id)` | 一站式：結構 ＋ 檢定 |

**(3) 局面池**

| 核心函式／常數 | 說明 |
|--------------|------|
| `STANDARD_ID` | `(3 * 36 + 13) * 32` = **3872**，標準開局 |
| `liteCandidates()` | 輕量版候選（象固定 c1/g1、兵全原位）**216 個** |
| `symCandidates()` | 軸對稱版候選（每方自身左右對稱）；靠 `SYM_E_PAIRS` / `SYM_BACK_PAIRS` / `SYM_CANNON_PAIRS` / `SYM_PMASKS` 四張對稱表產生 |
| `balancedCandidates()` / `BALANCED_IDS` | 平衡版 70 局。**這張表是引擎實測結果、不是算出來的**——改動擺法規則或檢定後必須重新評估（見 [spec.md §8](spec.md)） |

⚠ 兩個 `Candidates()` 回的是**候選編號，尚未過檢定**，呼叫端要自行 `filter(id => checkId(id).ok)`。

### 2.3 `src/ui.js`（242 行）— 演示層

整支包在一個 IIFE 裡，只呼叫 `rules.js` 與 `setup.js` 的**全域函式**，沒有 import。

| 核心函式 | 說明 |
|---------|------|
| `drawStatic(g)` | 畫棋盤：格線、河界、九宮斜線、砲兵位的十字標記（只畫一次） |
| `render()` | 依 `S.bd` 重繪所有棋子與選取高亮 |
| `renderPanel()` | 更新編號、機動力、提示文字、棋譜列表 |
| `loadId(id, note)` | 載入一個編號；**不合法時自動往後找最近的合法編號並說明原因** |
| `doMove(r, c, rr, cc)` | 走一步：驗合法性、更新盤面、記譜、判將軍／將死 |
| `notation(...)` | 產生「炮b3–e3」「×」這類記譜文字 |
| `gotoInput()` | 讀 `#posid` 跳轉 |

**版面常數**：`CELL = 54`、`MARGIN = 34`；座標轉換 `X(c) = MARGIN + c*CELL`、`Y(r) = MARGIN + (9-r)*CELL`
（**注意 Y 是反的**：`row 0` 是紅方底線，畫在畫面下方。）

**狀態**：單一物件 `S`（目前盤面、選取格、棋譜、模式、編號）。
**池切換**：`LISTS`（`lite` / `sym` / `balanced` 的密集編號陣列）＋ `MODE_LABEL` ＋ `MODE_NOTE`（切到該池時顯示的說明，平衡版用它標示驗證手法）；`curList()` 回目前池，完整版回 `null`（沿用原始編號）。

### 2.4 `src/shell.html`（190 行）— 演示頁外殼

HTML 結構、CSS、所有對外文案。**三個注入點**是純註解，`build.js` 會把它們換成 js 內容：

```
/*__RULES__*/    /*__SETUP__*/    /*__UI__*/
```

主要元素：`#board`（SVG）、`#mode`（池選單）、`#btn-random` / `#btn-standard` / `#btn-goto` / `#btn-undo` / `#btn-reset`、`#posid`（編號輸入）、`#info-id` / `#info-mob` / `#gen-note` / `#status`、`#movelist`。

**改演示頁的外觀或文案改這裡，不是 `docs/index.html`。**

---

## 3. 工具與驗證

| 檔案 | 用途 | 指令 |
|------|------|------|
| `scripts/build.js`（26 行） | 把 shell ＋ 三個 js **內聯**成單檔 `docs/index.html`：讀 shell → 換三個注入點 → 在 `</style>` 處切開 → 補 doctype/head/body | `npm run build` |
| `scripts/count.js`（62 行） | **全空間枚舉**：點對稱抽驗、標準局驗證、139 萬編號逐一 `checkId`、淘汰分解、機動力抽樣 | `npm run count`（約 19 秒） |
| `scripts/stats.js`（44 行） | 特徵統計（進兵比例、高位象比例）＋ 用中文字在終端機渲染示範局面 | `npm run stats` |
| `test/test-dom.js` | **20 項無頭 DOM 迴歸測試** | `npm test` |

### `test-dom.js` 的關鍵設計

它用 jsdom 載入的是 **`docs/index.html`（建置後的成品）**，不是原始碼：

```js
const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
```

**所以組裝流程壞掉也會被抓到**——注入點改名、`</style>` 切點跑掉，測試都會紅。
測試方式是**模擬真實點擊**（`click(c, r)` 換算成 SVG 座標派發事件），不是直接呼叫內部函式。

---

## 4. 資料結構

| 項目 | 定義 |
|------|------|
| 棋盤 | `bd[row][col]`，空點 `null` |
| 座標 | `row 0` = **紅方底線**，`row 9` = 黑方底線；`col 0..8` 對應直線 a..i（紅方視角左→右） |
| 棋子 | `{ t, c }`，`t ∈ K A B N R C P`（將士象馬車炮兵），`c ∈ 0 紅 / 1 黑` |
| 著法 | `[r, c, rr, cc]`（從 → 到） |
| 九宮 | `col 3..5`；紅 `row 0..2` / 黑 `row 7..9` |
| 宮頂線 | 紅 `row 2` / 黑 `row 7`（炮的原始橫線） |
| 河沿 | 紅 `row 4` / 黑 `row 5` |

---

## 5. 兩種執行環境（改載入方式時兩邊都要驗）

同一份 `setup.js` 要能在兩個環境跑：

- **Node**：`require('./rules.js')` 並把結果注入 `globalThis`
- **瀏覽器**：兩份 `<script>` 本來就共享全域詞法環境，不需要 import

所以 `rules.js` 的匯出寫成條件式（`if (typeof module !== 'undefined') module.exports = {...}`）。

**驗證方式**：`npm run count` 走 Node、`npm test` 走 jsdom，**兩個都跑過才算數**。

---

## 6. 不可破壞的不變量

| 不變量 | 怎麼驗 |
|--------|--------|
| `rules.js` 不得依賴 `setup.js` | 程式碼審查；反向 import 一律拒絕 |
| 紅黑點對稱：黑 `(9−r, 8−c)` 與紅 `(r,c)` 同型異色 | `npm run count` 的「點對稱抽驗違反格數 = 0」 |
| 標準開局在合法池內、編號 3872、紅方 44 著 | `npm run count` 前三行 |
| 走法引擎行為（蹩腿、塞眼、照面、隔子吃、過河橫走） | `npm test` |
| `makeMove()` 不 mutate 傳入盤面 | 沿用慣例；改動時特別小心 |
| `docs/index.html` 是建置產物 | **永遠不要手改**，只能由 `npm run build` 產生 |
| 演示頁單檔、零相依、可離線 | GitHub Pages 直接吃 `docs/index.html`；不引入框架或 bundler |

---

## 7. 常見任務地圖

| 想做什麼 | 動哪裡 |
|---------|--------|
| 改擺法規則（象位、兵形、炮位…） | `setup.js` 的 `E_POINTS` / `decodeId` / `setupFromId`；**編號系統可能要重算**，並走 [spec.md](spec.md) 的改規格 SOP |
| 改首著檢定 | `setup.js` 的 `quietStartCheck()` |
| 修行棋 bug | `rules.js`；**先在 `test/test-dom.js` 加一項會失敗的測試** |
| 改演示頁外觀／文案 | `src/shell.html`（**不是** `docs/index.html`） |
| 改演示頁互動 | `src/ui.js` |
| 新增統計或分析腳本 | `scripts/` |
| 新增一種局面池 | `setup.js` 加 `xxxCandidates()` ＋ `ui.js` 的 `LISTS` / `MODE_LABEL` ＋ `shell.html` 的 `<select>` |

---

## 8. 與外部引擎介接

要用象棋引擎（Pikafish、Fairy-Stockfish 等）分析 cc960 的開局，介面是 **FEN 文字**，不需要任何綁定：

```
setupFromId(id) → 棋盤 → toFen(bd) → "…… w - - 0 1" → 引擎
```

**象棋 FEN 的四個要點**（寫錯引擎會直接拒收）：

1. 棋子字母 `K A B N R C P`，大寫紅／小寫黑——正好等於 `bd[r][c].t`，零轉換
   （另有 WXF 流派用 `E` 表象、`H` 表馬，主流引擎不吃）
2. 第一段從**黑方底線（row 9）**寫到紅方底線（row 0），每列 `col 0→8`——**不翻轉 column**
3. 走子方寫 `w`（部分中文軟體用 `r`，主流引擎不接受）
4. 六個欄位不可省；第 5 欄是無吃子半回合數，須在 `0..119`

標準開局的 FEN（可當測試的 ground truth）：

```
rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1
```

> `toFen()` 尚未實作，是引擎審局的前置技術債（見 [roadmap.md](roadmap.md)）。
> 引擎二進位請放 `engine/`（已在 `.gitignore`），不要進版控。
