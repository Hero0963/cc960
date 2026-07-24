// cc960 — 演示頁互動層（棋盤 SVG 繪製、走子、三池切換）
// 只依賴 rules.js 與 setup.js 的全域函式；無任何外部函式庫。
(function () {
  'use strict';

  const CELL = 54, MARGIN = 34, NS = 'http://www.w3.org/2000/svg';
  const X = c => MARGIN + c * CELL;
  const Y = r => MARGIN + (9 - r) * CELL;
  const FILES = 'abcdefghi';
  const PIECE_CH = [
    { K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵' },
    { K: '將', A: '士', B: '象', N: '馬', R: '車', C: '包', P: '卒' },
  ];
  const PIECE_FONT = '"DFKai-SB","BiauKai","Kaiti TC","KaiTi","Noto Serif TC",serif';
  const REASON = {
    structural: '結構衝突（炮或進兵疊上象位）',
    'free-capture': '首著可白吃且對稱不可回應',
    'winning-capture': '首著可低值吃高值',
    facing: '開局照面', check: '開局被將',
  };

  const $ = id => document.getElementById(id);
  const svg = $('board');

  // 輕量版／軸對稱版：候選少，載入時全枚舉並給密集編號；完整版採「即抽即驗」
  const LISTS = {
    lite: liteCandidates().filter(id => checkId(id).ok),
    sym: symCandidates().filter(id => checkId(id).ok),
  };
  const MODE_LABEL = { lite: '輕量版', sym: '軸對稱版' };
  const curList = () => LISTS[S.mode] || null;

  const S = {
    mode: 'full', id: STANDARD_ID,
    bd: null, turn: RED, sel: null, dests: [],
    hist: [], last: null, over: null,
  };

  function el(name, attrs, text) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  // --- 棋盤靜態層 ---
  function drawStatic(g) {
    g.appendChild(el('rect', { x: 0, y: 0, width: 500, height: 554, rx: 6, fill: 'var(--board)', stroke: 'var(--board-edge)', 'stroke-width': 3 }));
    g.appendChild(el('rect', { x: MARGIN - 7, y: MARGIN - 7, width: 8 * CELL + 14, height: 9 * CELL + 14, fill: 'none', stroke: 'var(--board-line)', 'stroke-width': 2.5 }));
    const line = (x1, y1, x2, y2, w) => g.appendChild(el('line', { x1, y1, x2, y2, stroke: 'var(--board-line)', 'stroke-width': w || 1.2 }));
    for (let r = 0; r <= 9; r++) line(X(0), Y(r), X(8), Y(r));
    for (let c = 0; c <= 8; c++) {
      if (c === 0 || c === 8) line(X(c), Y(0), X(c), Y(9));
      else { line(X(c), Y(0), X(c), Y(4)); line(X(c), Y(5), X(c), Y(9)); }
    }
    for (const [r1, r2] of [[0, 2], [9, 7]]) {
      line(X(3), Y(r1), X(5), Y(r2)); line(X(5), Y(r1), X(3), Y(r2));
    }
    const ym = (Y(4) + Y(5)) / 2;
    for (const [t, x] of [['楚 河', X(2)], ['漢 界', X(6)]]) {
      g.appendChild(el('text', {
        x, y: ym, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        fill: 'var(--board-line)', 'font-size': 24, 'letter-spacing': '8',
        'font-family': PIECE_FONT, opacity: .85,
      }, t));
    }
    const mark = (r, c) => {
      const x = X(c), y = Y(r), d = 5, o = 8, p = [];
      if (c > 0) p.push(`M${x - o - d} ${y - o} h${d} v${-d}`, `M${x - o - d} ${y + o} h${d} v${d}`);
      if (c < 8) p.push(`M${x + o + d} ${y - o} h${-d} v${-d}`, `M${x + o + d} ${y + o} h${-d} v${d}`);
      g.appendChild(el('path', { d: p.join(' '), fill: 'none', stroke: 'var(--board-line)', 'stroke-width': 1.2 }));
    };
    for (const c of [0, 2, 4, 6, 8]) { mark(3, c); mark(6, c); }
    for (let c = 0; c <= 8; c++) g.appendChild(el('text', { x: X(c), y: 554 - 8, 'text-anchor': 'middle', fill: 'var(--board-line)', 'font-size': 11, opacity: .7 }, FILES[c]));
    for (let r = 0; r <= 9; r++) g.appendChild(el('text', { x: 12, y: Y(r) + 4, 'text-anchor': 'middle', fill: 'var(--board-line)', 'font-size': 11, opacity: .7 }, String(r + 1)));
  }

  // --- 全盤重繪 ---
  function render() {
    svg.textContent = '';
    const g = el('g', {});
    drawStatic(g);

    if (S.last) {
      const [fr, fc, tr, tc] = S.last;
      g.appendChild(el('circle', { cx: X(fc), cy: Y(fr), r: 6, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, opacity: .6 }));
      g.appendChild(el('circle', { cx: X(tc), cy: Y(tr), r: 27, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, opacity: .6 }));
    }

    const checked = !S.over && inCheck(S.bd, S.turn) ? findKing(S.bd, S.turn) : null;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = S.bd[r][c];
      if (!p) continue;
      const sel = S.sel && S.sel[0] === r && S.sel[1] === c;
      const pg = el('g', { class: 'piece', style: 'cursor:pointer' });
      pg.appendChild(el('circle', { cx: X(c), cy: Y(r), r: 23, fill: 'var(--piece-face)', stroke: sel ? 'var(--accent)' : 'var(--piece-rim)', 'stroke-width': sel ? 3 : 1.5 }));
      const tone = p.c === RED ? 'var(--red)' : 'var(--black-piece)';
      pg.appendChild(el('circle', { cx: X(c), cy: Y(r), r: 19.5, fill: 'none', stroke: tone, 'stroke-width': 1, opacity: .75 }));
      pg.appendChild(el('text', {
        x: X(c), y: Y(r), 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': 26, 'font-family': PIECE_FONT, 'font-weight': 700, fill: tone,
      }, PIECE_CH[p.c][p.t]));
      if (checked && p.t === 'K' && p.c === S.turn) {
        pg.appendChild(el('circle', { cx: X(c), cy: Y(r), r: 26, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 3 }));
      }
      g.appendChild(pg);
    }

    for (const [rr, cc] of S.dests) {
      if (S.bd[rr][cc]) g.appendChild(el('circle', { cx: X(cc), cy: Y(rr), r: 27, fill: 'none', stroke: 'var(--hint)', 'stroke-width': 3.5 }));
      else g.appendChild(el('circle', { cx: X(cc), cy: Y(rr), r: 7.5, fill: 'var(--hint)' }));
    }
    svg.appendChild(g);
    renderPanel();
  }

  function renderPanel() {
    const list = curList();
    if (list) {
      $('info-id-wrap').innerHTML = MODE_LABEL[S.mode] + ' <b>#' + (list.indexOf(S.id) + 1) + '／' + list.length + '</b>（編號 ' + S.id + '）';
      $('posid').min = 1; $('posid').max = list.length;
    } else {
      $('info-id-wrap').innerHTML = '編號 <b>' + S.id + '</b>';
      $('posid').min = 0; $('posid').max = RAW_TOTAL - 1;
    }
    $('info-mob').textContent = legalMoves(setupFromId(S.id), RED).length + ' 著';
    $('btn-undo').disabled = S.hist.length === 0;
    const st = $('status');
    if (S.over) {
      st.innerHTML = '<span class="over">' + S.over + '</span>';
    } else {
      st.innerHTML = (S.turn === RED ? '<span class="turn-red">● 紅方走子</span>' : '<span class="turn-black">● 黑方走子</span>')
        + (inCheck(S.bd, S.turn) ? '<span class="check">將軍！</span>' : '');
    }
  }

  // --- 局面載入 ---
  function loadId(id, note) {
    S.id = id;
    S.bd = setupFromId(id);
    S.turn = RED; S.sel = null; S.dests = []; S.hist = []; S.last = null; S.over = null;
    $('moves').textContent = '';
    const list = curList();
    $('posid').value = list ? list.indexOf(id) + 1 : id;
    $('gen-note').textContent = note || '';
    render();
  }

  // --- 行棋 ---
  function notation(bd, r, c, rr, cc) {
    const p = bd[r][c], v = bd[rr][cc];
    return PIECE_CH[p.c][p.t] + FILES[c] + (r + 1) + (v ? '×' : '–') + FILES[cc] + (rr + 1) + (v ? PIECE_CH[v.c][v.t] : '');
  }

  function doMove(r, c, rr, cc) {
    S.hist.push({ bd: S.bd, turn: S.turn, last: S.last, over: S.over });
    const li = document.createElement('li');
    li.textContent = notation(S.bd, r, c, rr, cc);
    if (S.turn === RED) li.className = 'red-mv';
    $('moves').appendChild(li);
    $('movelist').scrollTop = 1e6;
    S.bd = makeMove(S.bd, r, c, rr, cc);
    S.last = [r, c, rr, cc];
    S.turn = 1 - S.turn;
    S.sel = null; S.dests = [];
    if (legalMoves(S.bd, S.turn).length === 0) {
      const how = inCheck(S.bd, S.turn) ? '將死' : '困斃';
      S.over = how + '，' + (S.turn === RED ? '黑方勝' : '紅方勝');
    }
    render();
  }

  svg.addEventListener('click', ev => {
    if (S.over) return;
    const rect = svg.getBoundingClientRect();
    const sx = 500 / rect.width;
    const px = (ev.clientX - rect.left) * sx, py = (ev.clientY - rect.top) * sx;
    const c = Math.round((px - MARGIN) / CELL), rInv = Math.round((py - MARGIN) / CELL);
    const r = 9 - rInv;
    if (c < 0 || c > 8 || r < 0 || r > 9) return;
    if (Math.abs(px - X(c)) > CELL / 2 - 2 || Math.abs(py - Y(r)) > CELL / 2 - 2) return;

    if (S.sel && S.dests.some(d => d[0] === r && d[1] === c)) {
      doMove(S.sel[0], S.sel[1], r, c);
      return;
    }
    const p = S.bd[r][c];
    if (p && p.c === S.turn) {
      S.sel = [r, c];
      S.dests = legalMoves(S.bd, S.turn).filter(m => m[0] === r && m[1] === c).map(m => [m[2], m[3]]);
    } else {
      S.sel = null; S.dests = [];
    }
    render();
  });

  // --- 控制列 ---
  $('btn-random').addEventListener('click', () => {
    const list = curList();
    if (list) { loadId(list[Math.floor(Math.random() * list.length)]); return; }
    let id;                                 // 即抽即驗（接受率約 24%，均攤數次，毫秒級）
    do { id = Math.floor(Math.random() * RAW_TOTAL); } while (!checkId(id).ok);
    loadId(id);
  });
  $('btn-standard').addEventListener('click', () => loadId(STANDARD_ID));
  function gotoInput() {
    const n = parseInt($('posid').value, 10);
    const list = curList();
    if (list) {
      const k = Math.max(1, Math.min(list.length, n || 1));
      loadId(list[k - 1]);
      return;
    }
    let id = Math.max(0, Math.min(RAW_TOTAL - 1, isNaN(n) ? 0 : n));
    const res = checkId(id);
    if (res.ok) { loadId(id); return; }
    let next = id;                          // 往後找最近的合法編號（循環）
    do { next = (next + 1) % RAW_TOTAL; } while (!checkId(next).ok);
    loadId(next, '編號 ' + id + ' 不合法（' + (REASON[res.why] || res.why) + '），已跳至最近的合法編號 ' + next);
  }
  $('btn-goto').addEventListener('click', gotoInput);
  $('posid').addEventListener('keydown', ev => { if (ev.key === 'Enter') gotoInput(); });
  $('btn-reset').addEventListener('click', () => loadId(S.id));
  $('btn-undo').addEventListener('click', () => {
    const h = S.hist.pop();
    if (!h) return;
    S.bd = h.bd; S.turn = h.turn; S.last = h.last; S.over = h.over;
    S.sel = null; S.dests = [];
    const ml = $('moves');
    if (ml.lastChild) ml.removeChild(ml.lastChild);
    render();
  });
  $('mode').addEventListener('change', ev => {
    S.mode = ev.target.value;
    const list = curList();
    if (list && !list.includes(S.id)) loadId(STANDARD_ID);
    else loadId(S.id);
  });

  // 開場：標準開局（讓「跟標準只差在哪」一目瞭然，再讓使用者自己抽）
  loadId(STANDARD_ID);
})();
