// cc960 — 生成器頁的互動層（棋盤 SVG 繪製、勾選式產生器、FEN 與連結分享）
// 只依賴 rules.js 與 setup.js 的全域函式；無任何外部函式庫。
// 本頁只產生開局，不提供行棋——走法引擎仍在，供局面檢定與 FEN 使用。
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
    structural: '結構衝突（炮疊上宮頂線的象）',
    'free-capture': '首著可白吃且對稱不可回應',
    'winning-capture': '首著可低值吃高值',
    facing: '開局照面', check: '開局被將',
  };

  const $ = id => document.getElementById(id);
  const svg = $('board');

  // --- 勾選式產生器 ---
  const AXES = ['e', 'n', 'r', 'c', 'p'];
  const AXIS_LABEL = { e: '象', n: '馬', r: '車', c: '炮', p: '兵' };
  const FIXED_AT = { e: 'c1/g1', n: 'b/h', r: 'a/i', c: 'b/h', p: '全原位' };
  // 候選超過此數就不全枚舉、改即抽即驗：實測 4 萬多筆的枚舉＋檢定約 0.7 秒，全勾的 35 萬筆約 10 秒
  const ENUM_LIMIT = 60000;

  const S = { id: STANDARD_ID, sel: null, onlyBalanced: false };
  const poolCache = {};                       // 勾選組合 → 合法編號清單（null ＝ 該組合不枚舉）

  const readSel = () => AXES.reduce((s, a) => (s[a] = $('ck-' + a).checked, s), {});
  const selKey = sel => AXES.map(a => sel[a] ? '1' : '0').join('');

  function poolFor(sel) {
    const key = selKey(sel);
    if (!(key in poolCache)) {
      poolCache[key] = subsetCount(sel) > ENUM_LIMIT
        ? null
        : subsetCandidates(sel).filter(id => checkId(id).ok);
    }
    return poolCache[key];
  }

  // 只給平衡盤面時，池就是那 280 局與目前棋種勾選的交集（全勾時即全部 280 局）
  function balancedPoolFor(sel) {
    const key = 'B' + selKey(sel);
    if (!(key in poolCache)) {
      const inSel = new Set(subsetCandidates(sel));
      poolCache[key] = balancedCandidates().filter(id => inSel.has(id));
    }
    return poolCache[key];
  }

  const curPool = () => S.onlyBalanced ? balancedPoolFor(S.sel) : poolFor(S.sel);

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
    const bd = setupFromId(S.id);
    svg.textContent = '';
    const g = el('g', {});
    drawStatic(g);
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = bd[r][c];
      if (!p) continue;
      const pg = el('g', { class: 'piece' });
      pg.appendChild(el('circle', { cx: X(c), cy: Y(r), r: 23, fill: 'var(--piece-face)', stroke: 'var(--piece-rim)', 'stroke-width': 1.5 }));
      const tone = p.c === RED ? 'var(--red)' : 'var(--black-piece)';
      pg.appendChild(el('circle', { cx: X(c), cy: Y(r), r: 19.5, fill: 'none', stroke: tone, 'stroke-width': 1, opacity: .75 }));
      pg.appendChild(el('text', {
        x: X(c), y: Y(r), 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': 26, 'font-family': PIECE_FONT, 'font-weight': 700, fill: tone,
      }, PIECE_CH[p.c][p.t]));
      g.appendChild(pg);
    }
    svg.appendChild(g);
    $('info-id').textContent = S.id;
    $('fen').textContent = toFen(bd);
    const cp = balancedEval(S.id);
    $('info-eval').textContent = cp === null ? '' : '· 引擎實測先手優勢 ' + cp + ' 釐兵';
    $('info-eval').className = cp === null ? '' : 'eval';
  }

  function renderPoolNote() {
    const on = AXES.filter(a => S.sel[a]), off = AXES.filter(a => !S.sel[a]);
    // 勾了卻完全不影響結果的軸要標出來，否則使用者勾了看不出差別會以為壞掉。
    // 例：象釘 c1/g1、車釘 a/i 時，底線只剩 b/h 給馬——勾「馬」也沒得選。
    const total = subsetCount(S.sel);
    const isDead = a => subsetCount(Object.assign({}, S.sel, { [a]: false })) === total;
    let t = on.length
      ? '隨機：' + on.map(a => AXIS_LABEL[a] + (isDead(a) ? '（此設定下無可選位置）' : '')).join('、')
      : '五種棋子全部固定';
    if (off.length) t += '｜固定：' + off.map(a => AXIS_LABEL[a] + ' ' + FIXED_AT[a]).join('、');
    if (S.onlyBalanced) {
      t += '　→ 引擎驗證平衡 ' + balancedPoolFor(S.sel).length + ' 局';
    } else {
      const list = poolFor(S.sel);
      t += list ? '　→ 此組合共 ' + list.length + ' 局' : '　→ 局面太多，隨機時即抽即驗';
    }
    $('pool-note').textContent = t;
  }

  // --- 局面載入 ---
  function loadId(id, note) {
    S.id = id;
    $('posid').value = id;
    $('gen-note').textContent = note || '';
    $('gen-note').className = note ? 'gen-note warn' : 'gen-note';
    $('copy-note').textContent = '';
    // file:// 下瀏覽器會擋 replaceState（來源為 null），失敗就算了，不影響其他功能
    try { history.replaceState(null, '', location.pathname + '?id=' + id); } catch (e) { /* 忽略 */ }
    render();
  }

  // --- 分享 ---
  const shareLink = () => location.href.split('#')[0].split('?')[0] + '?id=' + S.id;

  function copyText(text, label) {
    const say = ok => { $('copy-note').textContent = ok ? label + '已複製' : '無法自動複製，請手動選取'; };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      say(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => say(true), fallback);
    } else fallback();
  }

  // --- 控制列 ---
  $('btn-random').addEventListener('click', () => {
    const list = curPool();
    loadId(list ? list[Math.floor(Math.random() * list.length)] : randomSubsetId(S.sel));
  });
  $('btn-standard').addEventListener('click', () => loadId(STANDARD_ID));

  function gotoInput() {
    const n = parseInt($('posid').value, 10);
    const id = Math.max(0, Math.min(RAW_TOTAL - 1, isNaN(n) ? 0 : n));
    const res = checkId(id);
    if (res.ok) { loadId(id); return; }
    let next = id;                            // 往後找最近的合法編號（循環）
    do { next = (next + 1) % RAW_TOTAL; } while (!checkId(next).ok);
    loadId(next, '編號 ' + id + ' 不合法（' + (REASON[res.why] || res.why) + '），已跳至最近的合法編號 ' + next);
  }
  $('btn-goto').addEventListener('click', gotoInput);
  $('posid').addEventListener('keydown', ev => { if (ev.key === 'Enter') gotoInput(); });

  $('btn-copy-fen').addEventListener('click', () => copyText($('fen').textContent, 'FEN '));
  $('btn-copy-link').addEventListener('click', () => copyText(shareLink(), '連結'));

  for (const a of AXES) {
    $('ck-' + a).addEventListener('change', () => { S.sel = readSel(); renderPoolNote(); });
  }
  $('ck-balanced').addEventListener('change', ev => {
    S.onlyBalanced = ev.target.checked;
    renderPoolNote();
  });

  // --- 開場 ---
  // 網址帶 ?id= 就載入該局（方便分享），否則用標準開局，讓「跟標準只差在哪」一目瞭然
  function initialId() {
    const m = /[?&]id=(\d+)/.exec(location.search || '');
    if (!m) return STANDARD_ID;
    const id = Number(m[1]);
    return (id < RAW_TOTAL && checkId(id).ok) ? id : STANDARD_ID;
  }
  $('posid').max = RAW_TOTAL - 1;
  S.sel = readSel();
  S.onlyBalanced = $('ck-balanced').checked;
  renderPoolNote();
  loadId(initialId());
})();
