// cc960 — 象棋走法引擎（Node 驗算與瀏覽器演示共用）
//
// 這一層只負責「標準中國象棋的行棋規則」，與隨機開局完全無關：
// 換句話說，把 setup.js 拿掉、改用標準開局擺法，這個檔案就是一副普通象棋。
//
// 座標：col 0..8（紅方視角左→右，對應 a..i），row 0..9（row 0 = 紅方底線，row 9 = 黑方底線）
// 棋子：{ t: 'K|A|B|N|R|C|P', c: 0 紅 | 1 黑 }
//   K 將帥　A 士仕　B 象相　N 馬傌　R 車俥　C 炮包　P 兵卒

const RED = 0, BLACK = 1;

// 子力價值（僅供開局檢定的「虧不虧」比較，不是引擎評估值）
const VAL = { R: 9, C: 4.5, N: 4, B: 2, A: 2, P: 1, K: 1000 };

function emptyBoard() {
  return Array.from({ length: 10 }, () => Array(9).fill(null));
}

function inBoard(r, c) { return r >= 0 && r <= 9 && c >= 0 && c <= 8; }

function inPalace(r, c, color) {
  if (c < 3 || c > 5) return false;
  return color === RED ? (r >= 0 && r <= 2) : (r >= 7 && r <= 9);
}

function ownSide(r, color) { return color === RED ? r <= 4 : r >= 5; }

function findKing(bd, color) {
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = bd[r][c];
    if (p && p.t === 'K' && p.c === color) return [r, c];
  }
  return null;
}

// 產生 (r,c) 上棋子的偽合法走法（不含自將檢查）
function pseudoMoves(bd, r, c) {
  const p = bd[r][c];
  if (!p) return [];
  const mv = [];
  const push = (rr, cc) => {
    if (!inBoard(rr, cc)) return false;
    const q = bd[rr][cc];
    if (!q) { mv.push([rr, cc]); return true; }      // 空點可走、可續行
    if (q.c !== p.c) mv.push([rr, cc]);              // 敵子可吃
    return false;                                     // 有子擋路
  };
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (p.t === 'K') {
    for (const [dr, dc] of ORTH) {
      const rr = r + dr, cc = c + dc;
      if (inPalace(rr, cc, p.c)) push(rr, cc);
    }
  } else if (p.t === 'A') {
    for (const dr of [-1, 1]) for (const dc of [-1, 1]) {
      const rr = r + dr, cc = c + dc;
      if (inPalace(rr, cc, p.c)) push(rr, cc);
    }
  } else if (p.t === 'B') {
    for (const dr of [-2, 2]) for (const dc of [-2, 2]) {
      const rr = r + dr, cc = c + dc;
      if (!inBoard(rr, cc) || !ownSide(rr, p.c)) continue;      // 不過河
      if (bd[r + dr / 2][c + dc / 2]) continue;                 // 塞象眼
      push(rr, cc);
    }
  } else if (p.t === 'N') {
    const J = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
    for (const [dr, dc] of J) {
      const rr = r + dr, cc = c + dc;
      if (!inBoard(rr, cc)) continue;
      const lr = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
      const lc = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
      if (bd[lr][lc]) continue;                                 // 蹩馬腿
      push(rr, cc);
    }
  } else if (p.t === 'R') {
    for (const [dr, dc] of ORTH) {
      let rr = r + dr, cc = c + dc;
      while (inBoard(rr, cc) && push(rr, cc)) { rr += dr; cc += dc; }
    }
  } else if (p.t === 'C') {
    for (const [dr, dc] of ORTH) {
      let rr = r + dr, cc = c + dc, jumped = false;
      while (inBoard(rr, cc)) {
        const q = bd[rr][cc];
        if (!jumped) {
          if (!q) mv.push([rr, cc]);
          else jumped = true;                                   // 遇到砲架
        } else if (q) {
          if (q.c !== p.c) mv.push([rr, cc]);                   // 隔子吃
          break;
        }
        rr += dr; cc += dc;
      }
    }
  } else if (p.t === 'P') {
    const f = p.c === RED ? 1 : -1;
    push(r + f, c);
    if (!ownSide(r, p.c)) { push(r, c - 1); push(r, c + 1); }   // 過河後可橫走
  }
  return mv;
}

// color 方是否攻擊 (tr,tc)（不含照面規則）
function isAttacked(bd, tr, tc, color) {
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = bd[r][c];
    if (!p || p.c !== color) continue;
    for (const [rr, cc] of pseudoMoves(bd, r, c)) {
      if (rr === tr && cc === tc) return true;
    }
  }
  return false;
}

// 將帥是否照面（同路且中間無隔子）
function kingsFacing(bd) {
  const rk = findKing(bd, RED), bk = findKing(bd, BLACK);
  if (!rk || !bk || rk[1] !== bk[1]) return false;
  for (let r = rk[0] + 1; r < bk[0]; r++) if (bd[r][rk[1]]) return false;
  return true;
}

function inCheck(bd, color) {
  const k = findKing(bd, color);
  if (!k) return true;
  return isAttacked(bd, k[0], k[1], 1 - color) || kingsFacing(bd);
}

function makeMove(bd, r, c, rr, cc) {
  const nb = bd.map(row => row.slice());
  nb[rr][cc] = nb[r][c];
  nb[r][c] = null;
  return nb;
}

// color 方所有合法走法（排除自將、照面）
function legalMoves(bd, color) {
  const out = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = bd[r][c];
    if (!p || p.c !== color) continue;
    for (const [rr, cc] of pseudoMoves(bd, r, c)) {
      const nb = makeMove(bd, r, c, rr, cc);
      if (!inCheck(nb, color)) out.push([r, c, rr, cc]);
    }
  }
  return out;
}

// ---------- 組合工具（setup.js 的編號系統會用到） ----------

// arr 中所有「取 2 個」的組合，字典序
function pairs(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) out.push([arr[i], arr[j]]);
  return out;
}

const C_PAIRS = pairs([0, 1, 2, 3, 4, 5, 6, 7, 8]);   // 炮的 36 種路組合

if (typeof module !== 'undefined') {
  module.exports = {
    RED, BLACK, VAL,
    emptyBoard, inBoard, inPalace, ownSide, findKing,
    pseudoMoves, isAttacked, kingsFacing, inCheck, makeMove, legalMoves,
    pairs, C_PAIRS,
  };
}
