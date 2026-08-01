// cc960 — 特徵統計（進兵比例、高位象比例）＋ 終端機渲染示範局面
// 用法：npm run stats（約 25 秒，同樣要跑完全空間）
const E = require('../src/rules.js');
const S = require('../src/setup.js');

const ch = { R: '車', N: '馬', B: '象', A: '士', K: '將', C: '砲', P: '兵' };
function render(bd) {
  let s = '';
  for (let r = 9; r >= 0; r--) {
    s += r.toString().padStart(2) + ' ';
    for (let c = 0; c < 9; c++) {
      const p = bd[r][c];
      s += p ? (p.c === 0 ? '\x1b[31m' + ch[p.t] + '\x1b[0m' : ch[p.t]) : '﹢';
    }
    s += '\n';
  }
  return s;
}

let valid = 0, withAdvPawn = 0, withAloftE = 0, bothFeatures = 0, pawnHome = 0;
const samples = { aloft: null, adv: null, both: null };
for (let id = 0; id < S.RAW_TOTAL; id++) {
  const bd = S.setupFromId(id);
  if (!bd || !S.quietStartCheck(bd).ok) continue;
  valid++;
  const d = S.decodeId(id);
  const adv = d.pMask !== 0;                    // 有兵前進
  const aloft = d.ePts.some(p => p[0] > 0);     // 有象不在底線
  if (adv) withAdvPawn++; else pawnHome++;
  if (aloft) withAloftE++;
  if (adv && aloft) { bothFeatures++; if (!samples.both) samples.both = id; }
  else if (aloft && !samples.aloft) samples.aloft = id;
  else if (adv && !samples.adv) samples.adv = id;
}
console.log('合法 =', valid);
console.log('含進兵 =', withAdvPawn, `(${(100 * withAdvPawn / valid).toFixed(1)}%)`, '兵全原位 =', pawnHome);
console.log('含高位象(宮頂線) =', withAloftE, `(${(100 * withAloftE / valid).toFixed(1)}%)`);
console.log('兩者兼具 =', bothFeatures);
for (const [k, id] of Object.entries(samples)) {
  if (id == null) continue;
  console.log(`--- 示範[${k}] 編號=${id}`, JSON.stringify(S.decodeId(id)));
  console.log(render(S.setupFromId(id)));
  console.log('紅方合法著法 =', E.legalMoves(S.setupFromId(id), E.RED).length);
}
