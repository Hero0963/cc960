// cc960 — 全空間枚舉統計：合法開局數、淘汰分解、點對稱抽驗、機動力抽樣
// 用法：npm run count（約 25 秒）。改動 src/setup.js 的規則或檢定後必跑。
const E = require('../src/rules.js');
const S = require('../src/setup.js');

// ---- 0) 點對稱驗證：均勻抽樣局面，逐格檢查 黑(9-r,8-c) ↔ 紅(r,c) 同型異色 ----
{
  let checked = 0, bad = 0;
  for (let id = 0; id < S.RAW_TOTAL; id += 2777) {
    const bd = S.setupFromId(id);
    if (!bd) continue;
    checked++;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = bd[r][c], q = bd[9 - r][8 - c];
      if ((p === null) !== (q === null)) { bad++; continue; }
      if (p && (p.t !== q.t || p.c === q.c)) bad++;
    }
  }
  console.log('[點對稱] 抽驗局面 =', checked, '違反格數 =', bad, '(預期 0)');
}

// ---- 1) 標準局面驗證 ----
{
  const bd = S.setupFromId(S.STANDARD_ID);
  const row0 = bd[0].map(p => p ? p.t : '.').join('');
  console.log('[標準] 編號 =', S.STANDARD_ID, '底線 =', row0, '(預期 RNBAKABNR)');
  console.log('[標準] 靜置檢定 =', JSON.stringify(S.quietStartCheck(bd)));
  console.log('[標準] 紅方合法著法 =', E.legalMoves(bd, E.RED).length, '(預期 44)');
}

// ---- 2) 全枚舉 ----
console.log('[枚舉] 編號空間 RAW_TOTAL =', S.RAW_TOTAL);
const t0 = Date.now();
const stats = { structural: 0, facing: 0, check: 0, 'free-capture': 0, 'winning-capture': 0 };
let valid = 0, liteValid = 0, pawnFixedValid = 0;
const liteSet = new Set(S.liteCandidates());
for (let id = 0; id < S.RAW_TOTAL; id++) {
  const res = S.checkId(id);
  // 兵遮罩是編號最低 5 bit（各象位組大小皆為 32 的倍數），故 id % 32 === 0 ⇔ 兵全原位
  if (res.ok) { valid++; if (liteSet.has(id)) liteValid++; if (id % 32 === 0) pawnFixedValid++; }
  else stats[res.why]++;
  if (id % 200000 === 199999) console.log('  …', id + 1, '/', S.RAW_TOTAL, 'valid so far', valid, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
console.log('[結果] 合法局面數 =', valid, '(預期 339484)');
console.log('[結果] 淘汰統計 =', JSON.stringify(stats));
console.log('[結果] 兵全原位子集合法 =', pawnFixedValid, '/', S.RAW_TOTAL / 32, '(預期 33236 / 43416)');
console.log('[結果] 輕量版(216 候選)合法 =', liteValid, '(預期 216)');
console.log('[結果] 軸對稱版合法 =', S.symCandidates().filter(id => S.checkId(id).ok).length, '(預期 146)');
console.log('[結果] 耗時 =', ((Date.now() - t0) / 1000).toFixed(1), 's');

// ---- 3) 抽樣機動力統計 ----
{
  let n = 0, sum = 0, min = 999, max = -1;
  const step = Math.max(1, Math.floor(S.RAW_TOTAL / 20000));
  for (let id = 0; id < S.RAW_TOTAL; id += step) {
    const bd = S.setupFromId(id);
    if (!bd || !S.quietStartCheck(bd).ok) continue;
    const m = E.legalMoves(bd, E.RED).length;
    n++; sum += m; min = Math.min(min, m); max = Math.max(max, m);
  }
  console.log('[抽樣] 紅方首著機動力 n=' + n, 'min=' + min, 'max=' + max, 'avg=' + (sum / n).toFixed(1));
}
