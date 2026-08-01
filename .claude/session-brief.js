// cc960 — SessionStart 簡報：印出 repo 現況與下一步，讓新 session 不必自己摸索。
// 只做唯讀操作（git log / status / 讀 docs/roadmap.md）。由 .claude/settings.json 掛在 SessionStart。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const git = (...args) => {
  try { return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
};

const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || '(非 git repo)';
const last = git('log', '-1', '--format=%h %s (%ad)', '--date=short') || '(無 commit)';
const dirty = git('status', '--porcelain').split('\n').filter(Boolean);

const out = [];
out.push('── cc960 · 隨機開局象棋 ──');
out.push(`分支 ${branch}｜最近 commit：${last}`);
out.push(dirty.length ? `工作區有 ${dirty.length} 個未提交變更：${dirty.slice(0, 5).map(l => l.slice(3)).join('、')}${dirty.length > 5 ? ' …' : ''}`
                      : '工作區乾淨');

// docs/roadmap.md 的「下一步」區塊（## 下一步 到下一個 ## 之間的清單項）
try {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'roadmap.md'), 'utf8');
  const sec = md.split(/^## /m).find(s => s.startsWith('下一步'));
  if (sec) {
    const items = sec.split('\n').filter(l => /^\d+\.\s+\*\*/.test(l)).slice(0, 4);  // 只取頂層編號項
    if (items.length) {
      out.push('下一步（docs/roadmap.md）：');
      items.forEach((it, i) => out.push(`  ${i + 1}. ` + it.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '')));
    }
  }
} catch { /* roadmap 不在就跳過 */ }

out.push('驗證：npm test（22 項）｜npm run count（約 10 秒，改規則必跑）｜規格正本 docs/spec.md');
console.log(out.join('\n'));
