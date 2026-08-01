// cc960 — 隨機開局擺位產生器（規格 v4）
//
// 三條結構規則：
//   一、紅黑「點對稱」：黑方 = 紅方旋轉 180°（紅 (r,c) ↔ 黑 (9-r, 8-c)）。
//       從各自座位看，雙方陣形一模一樣（紅「一路」兵進 ↔ 黑「1路」卒進，不是同一 column）。
//   二、象限定「原軌道」5 點（底線與宮頂線；v4 收掉河沿，見 spec.md §1）。
//   三、兵各路獨立，可原位或前進一格（每方 2^5 = 32 種兵形）。
// 檢定（quietStartCheck）：任一首著吃子須「有根且不虧」或「對稱可回應」。
//
// 依賴 rules.js 的走法引擎：Node 用 require 注入全域；瀏覽器中兩份 <script> 本就共享全域詞法環境。
// 完整規格與推導見 docs/spec.md。

if (typeof module !== 'undefined' && typeof RED === 'undefined') {
  Object.assign(globalThis, require('./rules.js'));
}

// 紅方象的原軌道 5 點 [row, col]：c1,g1（底線）、a3,e3,i3（宮頂線）
// v4 拿掉河沿 c5,g5——河頭象實戰極罕見，且實測對平衡率毫無影響（spec.md §1）
const E_POINTS = [[0, 2], [0, 6], [2, 0], [2, 4], [2, 8]];
const E_PAIRS = [];
for (let i = 0; i < E_POINTS.length; i++)
  for (let j = i + 1; j < E_POINTS.length; j++) E_PAIRS.push([i, j]);
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
const RAW_TOTAL = OFFSETS[OFFSETS.length - 1] + GROUPS[GROUPS.length - 1].size;  // 525,312

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

// 編號 → 局面；結構衝突（炮疊上宮頂線的象）回 null
// v4 象不再上河沿，兵與象不可能撞位，故只剩炮這一種衝突
function setupFromId(id) {
  const d = decodeId(id);
  if (!d) return null;
  const eKey = new Set(d.ePts.map(p => p[0] * 9 + p[1]));
  for (const f of d.cFiles) if (eKey.has(2 * 9 + f)) return null;           // 炮撞象（宮頂線）
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

// ===== 勾選式產生器：逐棋種決定「隨機」或「固定在標準開局位置」 =====
// sel = { e, n, r, c, p }，true 表示該棋種隨機擺放，false 表示釘在標準開局的位置：
//   象 c1/g1、馬 b/h、車 a/i、炮 b/h、兵全原位。五個軸互相獨立，共 32 種組合。
// 這五個位置在任何象位組下都取得到，因此每一種組合都必定含標準開局（編號 3872）。

const SUBSET_STD = { hPair: [1, 7], rPair: [0, 8], cIdx: 13, pMask: 0 };
const eqPair = (a, b) => a[0] === b[0] && a[1] === b[1];

// 某個軸可取的索引；不隨機時只回標準開局那一個（找不到回空陣列）
function axisIdxs(isFree, list, stdPair) {
  if (isFree) return list.map((_, i) => i);
  const i = list.findIndex(p => eqPair(p, stdPair));
  return i < 0 ? [] : [i];
}

// 象位組 × 馬 × 車 的所有組合（最多數百筆）。炮與兵在其上各自展開，
// 且每個三元組展開出的局面數都一樣，故「均勻抽三元組」＝「均勻抽局面」。
function subsetTriples(sel) {
  const out = [];
  for (const gi of (sel.e ? GROUPS.map((_, i) => i) : [0])) {
    const g = GROUPS[gi];
    for (const hIdx of axisIdxs(sel.n, g.hPairs, SUBSET_STD.hPair)) {
      const rPairs = pairs(g.backAvail.filter(f => !g.hPairs[hIdx].includes(f)));
      for (const rIdx of axisIdxs(sel.r, rPairs, SUBSET_STD.rPair)) out.push([gi, hIdx, rIdx]);
    }
  }
  return out;
}

// 三元組 → 該象位組宮頂線上的象所占的路（炮不可疊上去）
const cannonBlocked = gi => GROUPS[gi].pts.filter(p => p[0] === 2).map(p => p[1]);

// 某象位組下，炮還剩幾種擺法（扣掉疊上宮頂線象的組合）
function cannonOptions(gi, free) {
  const blocked = cannonBlocked(gi);
  const out = [];
  for (let cIdx = 0; cIdx < 36; cIdx++) {
    if (!free && cIdx !== SUBSET_STD.cIdx) continue;
    if (C_PAIRS[cIdx].some(f => blocked.includes(f))) continue;
    out.push(cIdx);
  }
  return out;
}

// 候選筆數，不實際生成——決定「要不要全枚舉」時用，避免為了數數就配置幾十萬筆陣列
function subsetCount(sel) {
  let n = 0;
  for (const [gi] of subsetTriples(sel)) n += cannonOptions(gi, sel.c).length * (sel.p ? 32 : 1);
  return n;
}

// 勾選式候選編號。**在生成階段就跳過結構衝突**（不再「先生成再丟」），
// 因此回傳的都擺得出來；是否通過首著靜置檢定仍由呼叫端用 checkId 過濾。
function subsetCandidates(sel) {
  const out = [];
  for (const [gi, hIdx, rIdx] of subsetTriples(sel)) {
    const base = OFFSETS[gi] + (hIdx * GROUPS[gi].rBase + rIdx) * 36 * 32;
    for (const cIdx of cannonOptions(gi, sel.c)) {
      for (let pMask = 0; pMask < 32; pMask++) {
        if (!sel.p && pMask !== SUBSET_STD.pMask) continue;
        out.push(base + cIdx * 32 + pMask);
      }
    }
  }
  return out;
}

// 即抽即驗：候選太多不值得全枚舉時用。同樣跳過結構衝突，只靠檢定重抽。
function randomSubsetId(sel) {
  const tri = subsetTriples(sel);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  for (;;) {
    const [gi, hIdx, rIdx] = pick(tri);
    const blocked = cannonBlocked(gi);
    const cIdx = sel.c ? Math.floor(Math.random() * 36) : SUBSET_STD.cIdx;
    if (C_PAIRS[cIdx].some(f => blocked.includes(f))) continue;
    const pMask = sel.p ? Math.floor(Math.random() * 32) : SUBSET_STD.pMask;
    const id = OFFSETS[gi] + ((hIdx * GROUPS[gi].rBase + rIdx) * 36 + cIdx) * 32 + pMask;
    if (checkId(id).ok) return id;
  }
}

// ===== 引擎驗證過的平衡開局（實測資料，不是算出來的）=====
// 這 280 局是 Pikafish 2026-01-02（UCI，NNUE）在固定 depth 40、單執行緒、置換表 1024 MB、
// MultiPV 1 下逐局實測，紅方先手優勢 |cp| <= 40 釐兵者。資料來自兩批批跑：
//   2026-07-25「只隨機馬車炮」216 局全跑；2026-08-01 三十二種勾選組合各取樣 min(25, N) 局。
// 兩批設定相同故可併表；共實測 617 局，其中 280 局入選。
// 40 釐兵的量尺意義：Pikafish 的評估已正規化到勝率，100 釐兵約當五成勝率，
// 故 40 釐兵約當「紅方勝率一成上下」——與標準開局（18 釐兵，也在池內）同一級距。
// ⚠ 改動擺法規則或首著檢定後，這張表就失效，必須重跑引擎評估。
// [原始編號, 紅方先手優勢（釐兵）]
const BALANCED_CP = [
  [0, 36], [192, 36], [256, 37], [352, 26], [448, 29], [992, 38],
  [1056, 33], [1120, 40], [1152, 19], [1216, 40], [1344, 20], [1408, 18],
  [1440, 15], [1536, 35], [1600, 12], [1728, 40], [1760, 36], [2208, 33],
  [3488, 37], [3520, 28], [3552, 31], [3584, 19], [3616, 28], [3640, 30],
  [3648, 26], [3680, 20], [3683, 24], [3712, 19], [3730, 39], [3744, 17],
  [3776, 34], [3808, 32], [3824, 23], [3840, 28], [3872, 18], [3873, 19],
  [3874, 16], [3875, 25], [3880, 19], [3881, 27], [3882, 28], [3883, 30],
  [3888, 19], [3889, 14], [3890, 18], [3896, 32], [3898, 37], [3899, 35],
  [3904, 28], [3936, 19], [3968, 26], [4000, 22], [4008, 36], [4032, 25],
  [4051, 26], [4064, 26], [4096, 28], [4098, 18], [4128, 24], [4137, 33],
  [4145, 15], [4160, 22], [4192, 21], [4224, 35], [4256, 25], [4288, 30],
  [4320, 30], [4329, 25], [4352, 37], [4376, 39], [4384, 30], [4416, 16],
  [4419, 26], [4448, 21], [4466, 16], [4480, 25], [4512, 23], [4513, 22],
  [4544, 33], [4800, 17], [4864, 31], [4992, 34], [5056, 26], [5184, 36],
  [5216, 39], [5344, 30], [5528, 40], [5568, 32], [5600, 17], [5664, 18],
  [5728, 19], [5952, 23], [6016, 39], [6048, 25], [6080, 29], [6081, 38],
  [6208, 39], [6528, 37], [6816, 39], [16544, 12], [16553, 28], [22304, 28],
  [24448, 39], [24459, 39], [24608, 29], [24611, 31], [25760, 38], [25763, 31],
  [25771, 26], [25777, 23], [25787, 35], [25888, 34], [26154, 40], [26912, 40],
  [33088, 15], [33090, 20], [33888, 17], [33891, 24], [56864, 27], [56875, 37],
  [57536, 24], [59168, 16], [59195, 37], [59904, 22], [60288, 16], [60312, 23],
  [60320, 23], [60330, 31], [60344, 18], [60346, 34], [60704, 16], [60715, 28],
  [67072, 26], [69376, 33], [87168, 35], [91424, 32], [93728, 37], [93739, 34],
  [93824, 37], [93850, 30], [94883, 40], [94897, 20], [94898, 36], [94976, 29],
  [95424, 23], [125984, 35], [125993, 32], [129450, 33], [129464, 35], [129465, 31],
  [129728, 29], [129881, 33], [130602, 36], [131072, 34], [131096, 39], [136928, 40],
  [158848, 35], [158849, 15], [160544, 23], [160553, 32], [163616, 32], [163624, 32],
  [163632, 38], [163712, 21], [163738, 25], [164000, 21], [164003, 22], [164017, 14],
  [164024, 20], [164026, 25], [164032, 30], [164035, 29], [164544, 14], [165088, 18],
  [170944, 27], [170962, 33], [176544, 22], [176547, 22], [194432, 22], [194441, 27],
  [195104, 28], [195112, 39], [195120, 16], [195456, 15], [195465, 40], [197408, 39],
  [198320, 31], [198560, 40], [198569, 28], [198570, 27], [198584, 28], [198720, 19],
  [198723, 33], [199136, 27], [199712, 24], [212288, 24], [240032, 9], [240034, 6],
  [258464, 17], [258483, 24], [260000, 21], [260018, 34], [260768, 31], [260779, 24],
  [263232, 33], [263235, 29], [264224, 26], [264249, 35], [265312, 29], [265330, 30],
  [265376, 24], [265379, 24], [265393, 19], [265408, 32], [265424, 32], [265568, 23],
  [265585, 20], [266080, 24], [266088, 24], [266528, 12], [266529, 15], [267168, 36],
  [267680, 26], [267689, 16], [269184, 27], [269202, 32], [279200, 40], [279203, 20],
  [285952, 33], [285955, 16], [286112, 19], [286130, 10], [300480, 32], [305696, 36],
  [305697, 32], [308160, 35], [355232, 36], [355234, 40], [362144, 35], [362162, 32],
  [362336, 40], [368065, 38], [369056, 37], [369066, 22], [369216, 31], [369243, 36],
  [369696, 28], [369714, 36], [371937, 39], [389792, 31], [389809, 25], [428800, 35],
  [428816, 37], [452992, 37], [453010, 37], [458912, 39], [458913, 29], [459200, 14],
  [459225, 16], [465824, 16], [465840, 28], [470720, 8], [470736, 5], [471584, 22],
  [471592, 18], [472736, 22], [472739, 20], [472745, 24], [472752, 19], [472753, 16],
  [473888, 12], [473912, 13], [474784, 26], [474800, 15], [478496, 14], [478505, 6],
  [493248, 21], [493256, 21], [493472, 18], [493488, 20],
];

const BALANCED_IDS = BALANCED_CP.map(e => e[0]);
const BALANCED_CP_BY_ID = new Map(BALANCED_CP);

function balancedCandidates() {
  return BALANCED_IDS.slice();
}

// 該編號的引擎實測評估（釐兵）；未入選平衡池者回 null
function balancedEval(id) {
  const v = BALANCED_CP_BY_ID.get(id);
  return v === undefined ? null : v;
}

// ===== 衍生版本：軸對稱版 =====
// 加一條限制：每方自身以中線（e 路）左右對稱；此時黑方「旋轉」與「翻面」結果相同，棋形如標準棋端正。
// 象取對稱點對、馬車炮取對稱路對、兵進格 a=i、c=g、中兵獨立。檢定沿用同一套 quietStartCheck。

const SYM_E_PAIRS = [[0, 1], [2, 4]];                      // E_POINTS 索引：{c1,g1}{a3,i3}（v4 起無 {c5,g5}）
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

// ===== 局面的字串表示：象棋 FEN =====
// 第一段自黑方底線（row 9）寫到紅方底線（row 0），每列 col 0→8（file a→i）；紅方大寫、黑方小寫。
// 第 3/4 欄（吃過路兵、王車易位）象棋無意義但不可省；第 5 欄是 rule60 計數，≥120 會被 Pikafish 拒收。
// 產出與公認 ground truth 逐字相符，且 Pikafish 2026-01-02 零拒收（見 spec.md §8）。
function toFen(bd) {
  const rows = [];
  for (let r = 9; r >= 0; r--) {
    let line = '', empty = 0;
    for (let c = 0; c <= 8; c++) {
      const p = bd[r][c];
      if (!p) { empty++; continue; }
      if (empty) { line += empty; empty = 0; }
      line += p.c === RED ? p.t : p.t.toLowerCase();
    }
    if (empty) line += empty;
    rows.push(line);
  }
  return rows.join('/') + ' w - - 0 1';
}

if (typeof module !== 'undefined') {
  module.exports = {
    E_POINTS, E_PAIRS, BACK_ALL, PAWN_FILES, GROUPS, OFFSETS, RAW_TOTAL,
    decodeId, setupFromId, legalCaptures, quietStartCheck, checkId, toFen,
    STANDARD_ID, liteCandidates, symCandidates, balancedCandidates, BALANCED_IDS, balancedEval,
    subsetTriples, subsetCount, subsetCandidates, randomSubsetId,
  };
}
