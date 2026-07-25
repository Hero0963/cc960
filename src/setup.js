// cc960 — 隨機開局擺位產生器（規格 v3）
//
// 三條結構規則：
//   一、紅黑「點對稱」：黑方 = 紅方旋轉 180°（紅 (r,c) ↔ 黑 (9-r, 8-c)）。
//       從各自座位看，雙方陣形一模一樣（紅「一路」兵進 ↔ 黑「1路」卒進，不是同一 column）。
//   二、象限定「原軌道」7 點（等同開局前已在己方領土走過合法步可達的點）。
//   三、兵各路獨立，可原位或前進一格（每方 2^5 = 32 種兵形）。
// 檢定（quietStartCheck）：任一首著吃子須「有根且不虧」或「對稱可回應」。
//
// 依賴 rules.js 的走法引擎：Node 用 require 注入全域；瀏覽器中兩份 <script> 本就共享全域詞法環境。
// 完整規格與推導見 docs/spec.md。

if (typeof module !== 'undefined' && typeof RED === 'undefined') {
  Object.assign(globalThis, require('./rules.js'));
}

// 紅方象的原軌道 7 點 [row, col]：c1,g1（底線）、a3,e3,i3（宮頂線）、c5,g5（河沿）
const E_POINTS = [[0, 2], [0, 6], [2, 0], [2, 4], [2, 8], [4, 2], [4, 6]];
const E_PAIRS = [];
for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) E_PAIRS.push([i, j]);
const BACK_ALL = [0, 1, 2, 6, 7, 8];   // 底線非九宮路 a,b,c,g,h,i
const PAWN_FILES = [0, 2, 4, 6, 8];    // 兵的 5 路 a,c,e,g,i

// 依象位分組的混合基數編號：每組大小 = C(m,2) 馬 × C(m-2,2) 車 × 36 炮 × 32 兵形
// （m = 扣掉底線象位後、底線還剩幾路可放車馬）
const GROUPS = E_PAIRS.map(([i, j]) => {
  const pts = [E_POINTS[i], E_POINTS[j]];
  const backOcc = pts.filter(p => p[0] === 0).map(p => p[1]);
  const backAvail = BACK_ALL.filter(f => !backOcc.includes(f));
  const hPairs = pairs(backAvail);
  const m = backAvail.length;
  const rBase = (m - 2) * (m - 3) / 2;
  return { pts, backAvail, hPairs, rBase, hrBase: hPairs.length * rBase, size: hPairs.length * rBase * 36 * 32 };
});
const OFFSETS = [];
{ let acc = 0; for (const g of GROUPS) { OFFSETS.push(acc); acc += g.size; } }
const RAW_TOTAL = OFFSETS[OFFSETS.length - 1] + GROUPS[GROUPS.length - 1].size;  // 1,389,312

// 編號 → 擺位描述；越界回 null
function decodeId(id) {
  if (id < 0 || id >= RAW_TOTAL) return null;
  let gi = GROUPS.length - 1;
  while (OFFSETS[gi] > id) gi--;
  const g = GROUPS[gi];
  let rem = id - OFFSETS[gi];
  const pMask = rem % 32; rem = Math.floor(rem / 32);
  const cIdx = rem % 36; rem = Math.floor(rem / 36);
  const rIdx = rem % g.rBase;
  const hIdx = Math.floor(rem / g.rBase);
  const hFiles = g.hPairs[hIdx];
  const rem2 = g.backAvail.filter(f => !hFiles.includes(f));
  const rFiles = pairs(rem2)[rIdx];
  return { ePts: g.pts, hFiles, rFiles, cFiles: C_PAIRS[cIdx], pMask };
}

// 編號 → 局面；結構衝突（炮或進兵疊上象位）回 null
function setupFromId(id) {
  const d = decodeId(id);
  if (!d) return null;
  const eKey = new Set(d.ePts.map(p => p[0] * 9 + p[1]));
  for (const f of d.cFiles) if (eKey.has(2 * 9 + f)) return null;           // 炮撞象（宮頂線）
  for (let i = 0; i < 5; i++)
    if ((d.pMask >> i) & 1 && eKey.has(4 * 9 + PAWN_FILES[i])) return null; // 進兵撞象（河沿）
  const bd = emptyBoard();
  for (const col of [RED, BLACK]) {
    // 點對稱：黑方 = 紅方旋轉 180°
    const put = (t, r, c) => {
      if (col === RED) bd[r][c] = { t, c: col };
      else bd[9 - r][8 - c] = { t, c: col };
    };
    put('K', 0, 4); put('A', 0, 3); put('A', 0, 5);
    for (const [r, c] of d.ePts) put('B', r, c);
    for (const f of d.hFiles) put('N', 0, f);
    for (const f of d.rFiles) put('R', 0, f);
    for (const f of d.cFiles) put('C', 2, f);
    for (let i = 0; i < 5; i++) put('P', ((d.pMask >> i) & 1) ? 4 : 3, PAWN_FILES[i]);
  }
  return bd;
}

// side 方所有「合法的首著吃子」（只生吃子著法、個別驗自將——比全合法著法快一個量級）
function legalCaptures(bd, side) {
  const out = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = bd[r][c];
    if (!p || p.c !== side) continue;
    for (const [rr, cc] of pseudoMoves(bd, r, c)) {
      if (!bd[rr][cc]) continue;
      if (!inCheck(makeMove(bd, r, c, rr, cc), side)) out.push([r, c, rr, cc]);
    }
  }
  return out;
}

// 首著靜置檢定：
// (a) 開局即照面或被將 → 不合法
// (b) 任一首著吃子若非「有根且不虧」（吃後可被反吃、且被吃子價值 ≤ 出手子價值），
//     也非「對稱可回應」（吃完後對方仍能走點對稱的對應著吃回同型子）→ 不合法
function quietStartCheck(bd) {
  if (kingsFacing(bd)) return { ok: false, why: 'facing' };
  if (inCheck(bd, RED) || inCheck(bd, BLACK)) return { ok: false, why: 'check' };
  for (const side of [RED, BLACK]) {
    for (const [r, c, rr, cc] of legalCaptures(bd, side)) {
      const victim = bd[rr][cc], attacker = bd[r][c];
      const after = makeMove(bd, r, c, rr, cc);
      const defended = isAttacked(after, rr, cc, 1 - side);
      if (defended && VAL[victim.t] <= VAL[attacker.t]) continue;   // 有根且不虧
      let symOK = false;                                            // 對稱可回應？（點對稱）
      const o = after[9 - r][8 - c], t = after[9 - rr][8 - cc];
      if (o && o.c === 1 - side && o.t === attacker.t && t && t.c === side && t.t === victim.t
          && pseudoMoves(after, 9 - r, 8 - c).some(m => m[0] === 9 - rr && m[1] === 8 - cc)
          && !inCheck(makeMove(after, 9 - r, 8 - c, 9 - rr, 8 - cc), 1 - side)) symOK = true;
      if (!symOK) return {
        ok: false, why: defended ? 'winning-capture' : 'free-capture',
        detail: { side, r, c, rr, cc, a: attacker.t, v: victim.t },
      };
    }
  }
  return { ok: true };
}

// 一站式判定：編號 → { ok, why? }
function checkId(id) {
  const bd = setupFromId(id);
  if (!bd) return { ok: false, why: 'structural' };
  return quietStartCheck(bd);
}

// 標準開局編號：象{c1,g1}=組 0、馬{b,h}、車{a,i}、炮{b,h}=cIdx 13、兵全原位
const STANDARD_ID = (3 * 36 + 13) * 32; // = 3872（組 0 內 hIdx 3、rIdx 0）

// 輕量版：組 0（象 c1,g1）＋兵全原位 ＝ 只隨機車馬炮的子集（216 局，全數合法）
function liteCandidates() {
  const out = [];
  const g = GROUPS[0];
  for (let hr = 0; hr < g.hrBase; hr++)
    for (let cI = 0; cI < 36; cI++)
      out.push(OFFSETS[0] + (hr * 36 + cI) * 32);
  return out;
}

// ===== 衍生版本：平衡版（引擎驗證）=====
// 輕量版 216 局全部餵給 Pikafish 2026-01-02（UCI，NNUE），固定 depth 40、單執行緒、
// 置換表 1024 MB、MultiPV 1，逐局取紅方先手優勢；保留 |評估| ≤ 40 釐兵者共 70 局。
// 40 釐兵的量尺意義：Pikafish 的評估已正規化到勝率，100 釐兵 ≈ 50% 勝率，
// 故 40 釐兵約當「紅方勝率 11% 上下」——與標準開局（18 釐兵）同一級距。
// 驗證日期 2026-07-25；方法與完整分布見 docs/spec.md §8。
// 此表是實測結果，不是算出來的：改動擺法規則或檢定後必須重新評估。
const BALANCED_IDS = [
  0, 192, 256, 352, 448, 992, 1056, 1120,
  1152, 1216, 1344, 1408, 1440, 1536, 1600, 1728,
  1760, 2208, 3488, 3520, 3552, 3584, 3616, 3648,
  3680, 3712, 3744, 3776, 3808, 3840, 3872, 3904,
  3936, 3968, 4000, 4032, 4064, 4096, 4128, 4160,
  4192, 4224, 4256, 4288, 4320, 4352, 4384, 4416,
  4448, 4480, 4512, 4544, 4800, 4864, 4992, 5056,
  5184, 5216, 5344, 5568, 5600, 5664, 5728, 5952,
  6016, 6048, 6080, 6208, 6528, 6816,
];

function balancedCandidates() {
  return BALANCED_IDS.slice();
}

// ===== 衍生版本：軸對稱版 =====
// 加一條限制：每方自身以中線（e 路）左右對稱；此時黑方「旋轉」與「翻面」結果相同，棋形如標準棋端正。
// 象取對稱點對、馬車炮取對稱路對、兵進格 a=i、c=g、中兵獨立。檢定沿用同一套 quietStartCheck。

const SYM_E_PAIRS = [[0, 1], [2, 4], [5, 6]];              // E_POINTS 索引：{c1,g1}{a3,i3}{c5,g5}
const SYM_BACK_PAIRS = [[0, 8], [1, 7], [2, 6]];           // 底線對稱路對 {a,i}{b,h}{c,g}
const SYM_CANNON_PAIRS = [[0, 8], [1, 7], [2, 6], [3, 5]]; // 炮對稱路對 {a,i}{b,h}{c,g}{d,f}
const SYM_PMASKS = [];                                      // 對稱兵形：bit 序 a,c,e,g,i
for (let s = 0; s < 8; s++) {
  SYM_PMASKS.push((s & 1 ? 0b10001 : 0) | (s & 2 ? 0b01010 : 0) | (s & 4 ? 0b00100 : 0));
}
const eq2 = (a, b) => a[0] === b[0] && a[1] === b[1];

// 全部軸對稱候選（以編號表示；含結構衝突者，交由 checkId 過濾）
function symCandidates() {
  const out = [];
  for (const ePair of SYM_E_PAIRS) {
    const eIdx = E_PAIRS.findIndex(p => eq2(p, ePair));
    const g = GROUPS[eIdx];
    for (const hPair of SYM_BACK_PAIRS) {
      const hIdx = g.hPairs.findIndex(p => eq2(p, hPair));
      if (hIdx < 0) continue;                                // 該路對被底線象佔用
      const rem = g.backAvail.filter(f => !hPair.includes(f));
      const rPairs = pairs(rem);
      for (const rPair of SYM_BACK_PAIRS) {
        if (eq2(rPair, hPair)) continue;
        const rIdx = rPairs.findIndex(p => eq2(p, rPair));
        if (rIdx < 0) continue;
        for (const cPair of SYM_CANNON_PAIRS) {
          const cIdx = C_PAIRS.findIndex(p => eq2(p, cPair));
          for (const mask of SYM_PMASKS) {
            out.push(OFFSETS[eIdx] + ((hIdx * g.rBase + rIdx) * 36 + cIdx) * 32 + mask);
          }
        }
      }
    }
  }
  return out.sort((a, b) => a - b);
}

if (typeof module !== 'undefined') {
  module.exports = {
    E_POINTS, E_PAIRS, BACK_ALL, PAWN_FILES, GROUPS, OFFSETS, RAW_TOTAL,
    decodeId, setupFromId, legalCaptures, quietStartCheck, checkId,
    STANDARD_ID, liteCandidates, symCandidates, balancedCandidates, BALANCED_IDS,
  };
}
