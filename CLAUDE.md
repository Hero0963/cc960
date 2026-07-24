# CLAUDE.md — cc960

> Claude Code 每次 session 自動讀本檔。**內容不重複維護**：操作規範用 `@import` 載入 `AGENTS.md`，
> 規格看 `docs/spec.md`，現況與下一步看 `docs/roadmap.md`。本檔只放 Claude Code 專屬備註。

## 操作指南（正本）
@AGENTS.md

## Claude Code 專屬備註

- **開工順序**：SessionStart hook 會印現況（分支／最近 commit／工作區是否乾淨／下一步）→ 讀 `docs/roadmap.md` 的「下一步」→ 需要動規則再讀 `docs/spec.md`。
- **標準五步**（交辦任務一律照做）：① 先讀相關檔案／查證，不憑記憶開工 → ② 給計畫（拆步驟、done 條件、風險）→ ③ 可拆解又獨立的重活才派 subagent 並行 → ④ 自驗證、逐項確認 done → ⑤ 做完立刻更新文件（`docs/roadmap.md` 進度日誌、必要時 `spec.md`／`README.md`／memory）。
- **驗證是硬性的**：改 `src/` 一定跑 `npm test`；動到 `src/setup.js` 的規則或檢定一定跑 `npm run count`（約 20 秒）並比對 `docs/spec.md §5` 的期望值。**沒跑就說沒跑，不要推測輸出。**
- **交付 HTML 前必做 Chrome headless preview**：
  ```bash
  "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
    --virtual-time-budget=5000 --dump-dom "file:///D:/it_project/cc960/docs/index.html"
  ```
  用 `--dump-dom` 確認棋子節點數＝32、編號 3872、44 著；必要時 `--screenshot=<絕對路徑>` 看版面。
- **git 需當次授權**：commit／push／開 PR 都要本次明確授權，上次的不沿用；不在 `main` 以外亂開分支前先問；禁 force push。
- **不永久刪檔**：要移除的東西移進 repo 根目錄的 `soft-delete/<時間戳>/<原相對路徑>`，不用 `rm`／`git rm`／`Remove-Item`。
- **這是公開 repo**：程式、文件、commit 訊息裡不要出現真實姓名、公司名、私人本機路徑或個人聯絡方式。
- **助理記憶**：`~/.claude/projects/D--it-project-cc960/memory/`（索引 `MEMORY.md`）。個人脈絡（為什麼做這專案、與職涯的關係、歷史報告在哪）寫在那裡，**不要寫進 repo**。
- 文件語言：繁體中文；相對日期一律換絕對日期（`YYYY-MM-DD`，Asia/Taipei）。
