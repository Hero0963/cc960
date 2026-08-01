# 貢獻指南

歡迎三種貢獻：**規則設計的意見**、**程式修正**、**試玩心得**。不需要會寫程式也能參與前者與後者。

## 環境

- Node.js ≥ 18（開發時用 v22）。無執行期相依，`npm install` 只裝測試用的 jsdom。
- 產生器頁不需要伺服器：`docs/index.html` 用瀏覽器直接開即可（`file://` 下分享連結不會自動同步網址，屬瀏覽器安全限制，其餘功能正常）。

```bash
git clone https://github.com/Hero0963/cc960.git
cd cc960
npm install
npm test          # build ＋ 32 項無頭 DOM 測試
```

## 指令

| 指令 | 用途 | 耗時 |
|------|------|------|
| `npm run build` | `src/` → `docs/index.html`（單檔產生器頁） | 即時 |
| `npm test` | build ＋ 32 項 jsdom 迴歸測試 | 數秒 |
| `npm run count` | 全空間枚舉：合法局面數、淘汰分解、機動力抽樣 | 約 10 秒 |
| `npm run stats` | 特徵統計＋終端機渲染示範局面 | 約 10 秒 |

## 專案結構

```
src/rules.js       象棋走法引擎（不依賴 setup.js；就是一副普通象棋）
src/setup.js       隨機開局產生器＋編號系統＋首著靜置檢定（依賴 rules.js）
src/ui.js          產生器頁互動層（棋盤 SVG、勾選式產生器、FEN 與分享）
src/shell.html     產生器頁外殼（HTML/CSS/文案）
scripts/build.js   組裝：shell ＋ 三個 js 內聯 → docs/index.html
scripts/count.js   全空間枚舉驗證
scripts/stats.js   特徵統計
test/test-dom.js   無頭 DOM 迴歸測試（測建置後的成品）
docs/spec.md       規格正本 ★
docs/rationale.md  設計動機與方案評估
docs/index.html    建置產物 — 請勿手改
```

**`docs/index.html` 是 `npm run build` 產生的**。要改產生器頁，改 `src/shell.html` 或 `src/ui.js`，再重新 build。

## 開發規則

1. **規格先行**：任何規則變更，先改 `docs/spec.md` 再改程式。程式與規格不一致時以規格為準。
2. **改完必驗**：動到 `src/setup.js` 的規則或檢定 → 一定要跑 `npm run count`，並把新數字更新到 `docs/spec.md §5`、`§7 版本歷程`、`README.md`、`package.json`、`scripts/build.js` 的 meta description。
3. **測試要一起改**：測試裡寫死了 3872／216／16／10803／標準開局 FEN 等期望值，規格改了要同步更新。
4. 保持**零相依、單檔可離線**的產生器頁；不要引入框架或 bundler。用瀏覽器 API 時要為 `file://` 準備 fallback。
5. 程式註解用繁體中文，寫「為什麼」；棋類術語用棋手講法。
6. `makeMove()` 回傳新棋盤，不 mutate 輸入——沿用這個慣例。

## 提 issue

| 類型 | 請附上 |
|------|--------|
| **走法引擎 bug** | 局面編號（或 FEN）＋ 走子序列 ＋ 預期與實際行為。註：產生器頁不提供行棋，請直接用 `src/rules.js` 復現 |
| **規則設計意見** | 你的棋力背景（有助判斷）、具體想改什麼、理由；歡迎反對意見 |
| **試玩心得** | 勾了哪些棋種、下了幾局、主觀感受（新鮮度／守和難度／彆扭的地方）——這正是目前最缺的資料 |
| **新變體提案** | 對照 `docs/spec.md §10` 的 v5 方向；說明會不會破壞「預走合法步」與點對稱兩個核心原則 |

## PR

- 一個 PR 做一件事，附上 `npm test`（必要時 `npm run count`）的輸出。
- 規則類 PR 請先開 issue 討論再動手——規格變更牽涉整份文件與測試的連動更新。
- Commit 訊息用祈使句，中英文皆可（例：`fix: 修正宮頂線象的塞象眼判定`）。

## 授權

送出貢獻即表示同意以 [MIT](LICENSE) 授權釋出。
