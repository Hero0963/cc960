# cc960 架構指南

> 這份講**程式怎麼組起來的**：分幾層、每個模組負責什麼、核心函式是什麼、資料怎麼流。
> 規則與數字的正本是 [spec.md](spec.md)；開發流程與 PR 慣例見 [../CONTRIBUTING.md](../CONTRIBUTING.md)。
> 最後更新：2026-08-01

---

## 0. 心智模型

整個專案只有 **677 行 JavaScript**，零執行期相依。可以用一句話理解：

> **一副普通的象棋引擎（`rules.js`）＋ 一個「把整數編號變成開局擺法」的產生器（`setup.js`）。**

這兩者是**單向相依**的：`setup.js` 用 `rules.js`，反過來絕對不行。
`rules.js` 完全不知道「隨機開局」這回事——它就是一副標準象棋，換掉起始盤面照樣運作。
**這個分界是整個設計的地基**，破壞它等於讓走法引擎與變體規則糾纏在一起。

---

## 1. 分層

```
                       ┌─────────────────────────────┐
  展示層                │ shell.html  外殼：HTML/CSS/文案 │
                       │ ui.js       SVG 棋盤、勾選式產生 │
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

### 2.2 `src/setup.js`（315 行）— 隨機開局產生器 ★ 專案核心

**職責**：整數編號 ⇄ 開局盤面，加上合法性檢定。三件事：

**(1) 編號系統**——混合基數（mixed-radix），把五個欄位打包成一個整數：

| 常數 | 值 | 意義 |
|------|-----|------|
| `E_POINTS` | `[[0,2],[0,6],[2,0],[2,4],[2,8]]` | 象的「原軌道」5 點：c1,g1／a3,e3,i3（v4 起不含河沿 c5,g5） |
| `BACK_ALL` | `[0,1,2,6,7,8]` | 底線非九宮路 a,b,c,g,h,i |
| `PAWN_FILES` | `[0,2,4,6,8]` | 兵的 5 路 a,c,e,g,i |
| `GROUPS` / `OFFSETS` | 10 組 | 依象位分組（各組大小不同，用前綴和定位） |
| `RAW_TOTAL` | **525,312** | 編號空間 |

| 核心函式 | 說明 |
|---------|------|
| `decodeId(id)` | 編號 → `{ ePts, hFiles, rFiles, cFiles, pMask }`；越界回 `null` |
| `setupFromId(id)` | 編號 → 棋盤；**結構衝突（炮疊上宮頂線的象）回 `null`** |

**(2) 首著靜置檢定**

| 核心函式 | 說明 |
|---------|------|
| `legalCaptures(bd, side)` | **只生吃子著法**再個別驗自將——刻意的快路徑，比全合法著法快一個量級。全枚舉 52 萬局時這是效能關鍵 |
| `quietStartCheck(bd)` | → `{ ok, why?, detail? }`。任一首著吃子須「有根且不虧」或「對稱可回應」 |
| `checkId(id)` | 一站式：結構 ＋ 檢定 |

**(3) 局面池**

| 核心函式／常數 | 說明 |
|--------------|------|
| `STANDARD_ID` | `(3 * 36 + 13) * 32` = **3872**，標準開局 |
| `liteCandidates()` | 輕量版候選（象固定 c1/g1、兵全原位）**216 個** |
| `symCandidates()` | 軸對稱版候選（每方自身左右對稱）；靠 `SYM_E_PAIRS` / `SYM_BACK_PAIRS` / `SYM_CANNON_PAIRS` / `SYM_PMASKS` 四張對稱表產生 |
| `balancedCandidates()` / `BALANCED_IDS` / `balancedEval(id)` | 引擎驗證平衡池 **280 局**，資料在 `BALANCED_CP`（`[編號, 釐兵]` 對）。**這張表是引擎實測結果、不是算出來的**——改動擺法規則或檢定後必須重新評估（見 [spec.md §8.3](spec.md)） |

⚠ 兩個 `Candidates()` 回的是**候選編號，尚未過檢定**，呼叫端要自行 `filter(id => checkId(id).ok)`。

**(4) 勾選式產生器**（2026-08-01 起的主要入口）

`sel = { e, n, r, c, p }`，布林值：`true` ＝ 該棋種隨機、`false` ＝ 釘在標準開局位置（象 c1/g1、馬 b/h、車 a/i、炮 b/h、兵全原位）。

| 核心函式 | 說明 |
|---------|------|
| `subsetTriples(sel)` | 「象位組 × 馬 × 車」全列表（最多數百筆）。**每個三元組展開的局面數相同**，故均勻抽三元組＝均勻抽局面 |
| `subsetCount(sel)` | 候選筆數，不實際生成——避免為了數數就配置幾十萬筆陣列 |
| `subsetCandidates(sel)` | 候選編號，**在生成階段就跳過結構衝突** |
| `randomSubsetId(sel)` | 即抽即驗，回傳已過檢定的編號 |

**(5) FEN 輸出**：`toFen(bd)` → 象棋 FEN 字串。詳見 §8。

### 2.3 `src/ui.js`（193 行）— 產生器頁的互動層

整支包在一個 IIFE 裡，只呼叫 `rules.js` 與 `setup.js` 的**全域函式**，沒有 import。
**這一層不提供行棋**（2026-08-01 移除）：頁面只生成開局，走法引擎留給檢定與 FEN 使用。

| 核心函式 | 說明 |
|---------|------|
| `drawStatic(g)` | 畫棋盤：格線、河界、九宮斜線、砲兵位的十字標記 |
| `render()` | 依 `S.id` 重繪棋子，並更新 `#info-id` 與 `#fen` |
| `poolFor(sel)` | 勾選組合 → 合法編號清單；候選 > `ENUM_LIMIT`（60,000）回 `null` 表示改即抽即驗。結果以 `poolCache` 依組合鍵快取 |
| `balancedPoolFor(sel)` | 平衡池 280 局 ∩ 目前棋種勾選（全勾時 280、只勾馬車炮時 70）；同樣走 `poolCache`，鍵前綴 `B` |
| `curPool()` | 依「只給平衡盤面」勾選決定用哪個池 |
| `renderPoolNote()` | 描述目前勾選（隨機哪些、固定哪些、共幾局）。用 `subsetCount` 比對「把某軸改成固定後筆數變不變」，把**勾了卻無可選位置**的軸標出來 |
| `loadId(id, note)` | 載入一個編號、同步網址 `?id=`、更新 FEN |
| `gotoInput()` | 讀 `#posid` 跳轉；**不合法時自動往後找最近的合法編號並說明原因** |
| `copyText(text, label)` | 複製到剪貼簿；`navigator.clipboard` 不可用時退回隱藏 textarea ＋ `execCommand` |

**版面常數**：`CELL = 54`、`MARGIN = 34`；座標轉換 `X(c) = MARGIN + c*CELL`、`Y(r) = MARGIN + (9-r)*CELL`
（**注意 Y 是反的**：`row 0` 是紅方底線，畫在畫面下方。）

**狀態**：單一物件 `S`（`id` ＝ 目前編號、`sel` ＝ 棋種勾選、`onlyBalanced` ＝ 是否只給平衡盤面）。盤面不存在 `S` 裡，每次由 `setupFromId(S.id)` 現算。
**網址同步**：`history.replaceState` 包在 `try/catch` 裡——`file://` 開啟時瀏覽器會擋（來源為 null），失敗就只是不同步，不影響其他功能。

### 2.4 `src/shell.html`（166 行）— 產生器頁外殼

HTML 結構、CSS、所有對外文案。**三個注入點**是純註解，`build.js` 會把它們換成 js 內容：

```
/*__RULES__*/    /*__SETUP__*/    /*__UI__*/
```

主要元素：`#board`（SVG）、`#ck-e`/`#ck-n`/`#ck-r`/`#ck-c`/`#ck-p`（五個棋種勾選）、`#ck-balanced`（只給平衡盤面）、`#btn-random` / `#btn-standard` / `#btn-goto`、`#posid`（編號輸入）、`#info-id` / `#info-eval` / `#fen` / `#pool-note` / `#gen-note` / `#copy-note`、`#btn-copy-fen` / `#btn-copy-link`。

**改產生器頁的外觀或文案改這裡，不是 `docs/index.html`。**

---

## 3. 工具與驗證

| 檔案 | 用途 | 指令 |
|------|------|------|
| `scripts/build.js`（26 行） | 把 shell ＋ 三個 js **內聯**成單檔 `docs/index.html`：讀 shell → 換三個注入點 → 在 `</style>` 處切開 → 補 doctype/head/body | `npm run build` |
| `scripts/count.js`（64 行） | **全空間枚舉**：點對稱抽驗、標準局驗證、52 萬編號逐一 `checkId`、淘汰分解、機動力抽樣 | `npm run count`（約 10 秒） |
| `scripts/stats.js`（44 行） | 特徵統計（進兵比例、高位象比例）＋ 用中文字在終端機渲染示範局面 | `npm run stats` |
| `test/test-dom.js` | **32 項無頭 DOM 迴歸測試** | `npm test` |

> **走法引擎的迴歸保護在 `npm run count`**：合法局面數（172,848）、輕量版 216、軸對稱版 100、平衡池 280、標準局 44 著這些期望值，只要引擎行為被改壞就會立刻不對。
> 頁面移除行棋功能後不再有走子／吃子的 DOM 測試，但引擎並未失去保護。

### `test-dom.js` 的關鍵設計

它用 jsdom 載入的是 **`docs/index.html`（建置後的成品）**，不是原始碼：

```js
const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: BASE, runScripts: 'dangerously', pretendToBeVisual: true });
```

**所以組裝流程壞掉也會被抓到**——注入點改名、`</style>` 切點跑掉，測試都會紅。
測試方式是**模擬真實互動**（派發 click 與 change 事件），不是直接呼叫內部函式。
`url` 一定要給（不能用預設的 `about:blank`），否則 `history.replaceState` 與 `?id=` 相關的項目測不到。

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
| 走法引擎行為（蹩腿、塞眼、照面、隔子吃、過河橫走） | `npm run count`：引擎一被改壞，172,848／216／100／70／44 這些期望值立刻不對 |
| 32 種勾選組合每一種都含標準開局 | `npm test` |
| `BALANCED_CP` 是引擎實測名單 | 改擺法規則或檢定後**必須重跑引擎評估**；`npm run count` 只驗它們仍合法 |
| `makeMove()` 不 mutate 傳入盤面 | 沿用慣例；改動時特別小心 |
| `docs/index.html` 是建置產物 | **永遠不要手改**，只能由 `npm run build` 產生 |
| 產生器頁單檔、零相依、可離線 | GitHub Pages 直接吃 `docs/index.html`；不引入框架或 bundler |

---

## 7. 常見任務地圖

| 想做什麼 | 動哪裡 |
|---------|--------|
| 改擺法規則（象位、兵形、炮位…） | `setup.js` 的 `E_POINTS` / `decodeId` / `setupFromId`；**編號系統可能要重算**，並走 [spec.md](spec.md) 的改規格 SOP |
| 改首著檢定 | `setup.js` 的 `quietStartCheck()` |
| 修行棋 bug | `rules.js`；改完必跑 `npm run count`（期望值就是引擎的迴歸保護） |
| 改產生器頁外觀／文案 | `src/shell.html`（**不是** `docs/index.html`） |
| 改產生器頁互動 | `src/ui.js` |
| 新增統計或分析腳本 | `scripts/` |
| 調整勾選式產生器 | `setup.js` 的 `SUBSET_STD` / `subsetTriples` / `subsetCandidates` ＋ `ui.js` 的 `AXES` / `AXIS_LABEL` / `FIXED_AT` ＋ `shell.html` 的勾選列 |
| 新增一種具名子池（如平衡版） | `setup.js` 加 `xxxCandidates()`；要不要放進介面另外決定 |

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

> `toFen()` 已於 2026-08-01 落地在 `src/setup.js`（`npm test` 有逐字比對 ground truth 的項目），產生器頁也直接顯示並可複製。
> 引擎二進位請放 `engine/`（已在 `.gitignore`），不要進版控。
