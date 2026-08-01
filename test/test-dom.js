// cc960 — 生成器頁無頭迴歸測試（32 項）
// 用法：npm test（需先 npm install 取得 jsdom，且先 npm run build 產生 docs/index.html）
// 測的是「建置後的成品」而非原始碼，因此組裝流程壞掉也會被抓到。
// 走法引擎本身的迴歸保護在 `npm run count`（合法局面數等期望值一變就代表引擎壞了）。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const BASE = 'https://example.org/cc960/';
const dom = new JSDOM(html, { url: BASE, runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) fails++; };
const click = id => $(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const setCk = (axes) => {
  for (const a of ['e', 'n', 'r', 'c', 'p']) {
    $('ck-' + a).checked = axes.includes(a);
    $('ck-' + a).dispatchEvent(new window.Event('change', { bubbles: true }));
  }
};
const curId = () => parseInt($('info-id').textContent, 10);

const STD_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// 1) 開場：標準開局、32 子、FEN 逐字正確
ok($('info-id').textContent === '3872', '開場為標準開局編號 3872（實際: ' + $('info-id').textContent + '）');
ok(doc.querySelectorAll('#board g.piece text').length === 32, '棋盤上有 32 枚棋子');
ok($('fen').textContent === STD_FEN, '標準開局 FEN 逐字正確（實際: ' + $('fen').textContent + '）');

// 2) 對局功能與規則區確實移除（不是藏起來）
{
  const gone = ['status', 'moves', 'movelist', 'btn-undo', 'btn-reset', 'mode', 'info-mob'];
  const left = gone.filter(id => $(id) !== null);
  ok(left.length === 0, '對局介面與版本選單已移除（殘留: ' + (left.join(',') || '無') + '）');
  ok(doc.querySelector('details') === null, '規則摺疊區已移除');
}

// 3) 全勾（預設）：即抽即驗、抽出來的都是完整 32 子的合法局面、點對稱成立
ok($('pool-note').textContent.includes('即抽即驗'), '全勾時標示即抽即驗（實際: ' + $('pool-note').textContent + '）');
{
  let allOk = true, symOk = true;
  for (let i = 0; i < 5; i++) {
    click('btn-random');
    if (doc.querySelectorAll('#board g.piece text').length !== 32) allOk = false;
    if (!window.checkId(curId()).ok) allOk = false;
    const bd = window.setupFromId(curId());
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = bd[r][c], q = bd[9 - r][8 - c];
      if ((p === null) !== (q === null)) { symOk = false; continue; }
      if (p && (p.t !== q.t || p.c === q.c)) symOk = false;
    }
  }
  ok(allOk, '連抽 5 局皆為 32 子且通過檢定');
  ok(symOk, '隨機局面紅黑點對稱成立');
  ok(/^([a-zA-Z0-9]+\/){9}[a-zA-Z0-9]+ w - - 0 1$/.test($('fen').textContent),
    'FEN 隨局面更新且格式正確（實際: ' + $('fen').textContent + '）');
}

// 4) 跳轉：輸入吃原始編號；不合法時往後找最近的合法編號並說明原因
{
  let badId = 0;
  while (window.checkId(badId).ok) badId++;
  $('posid').value = String(badId);
  click('btn-goto');
  const note = $('gen-note').textContent;
  ok(note.includes('不合法') && note.includes('已跳至'), '不合法編號自動跳轉並提示（badId=' + badId + '，實際: ' + note + '）');
  click('btn-standard');
  ok(curId() === 3872, '「標準開局」回到 3872');
}

// 5) 勾選式產生器：各組合的局數，以及「不勾＝釘在標準開局位置」
setCk(['n', 'r', 'c']);
ok($('pool-note').textContent.includes('共 216 局'), '只隨機馬車炮 ＝ 216 局（實際: ' + $('pool-note').textContent + '）');
{
  const lite = new Set(window.liteCandidates().filter(id => window.checkId(id).ok));
  let inPool = true;
  for (let i = 0; i < 20; i++) { click('btn-random'); if (!lite.has(curId())) inPool = false; }
  ok(inPool, '只隨機馬車炮時，連抽 20 局都落在輕量版 216 內');
}

setCk([]);
ok($('pool-note').textContent.includes('共 1 局'), '全不勾 ＝ 只剩標準開局 1 局（實際: ' + $('pool-note').textContent + '）');
{
  let always = true;
  for (let i = 0; i < 3; i++) { click('btn-random'); if (curId() !== 3872) always = false; }
  ok(always, '全不勾時隨機必定抽到 3872');
}

setCk(['p']);
ok($('pool-note').textContent.includes('共 16 局'), '只隨機兵 ＝ 16 局（中兵一進就被白吃，32 種兵形只存活一半）');

// 5.5) 退化的勾選要標出來：象釘 c1/g1、車釘 a/i 時，底線只剩 b/h 給馬
setCk(['n']);
ok($('pool-note').textContent.includes('馬（此設定下無可選位置）') && $('pool-note').textContent.includes('共 1 局'),
  '只勾馬時標示無可選位置（實際: ' + $('pool-note').textContent + '）');
setCk(['n', 'r']);
ok(!$('pool-note').textContent.includes('無可選位置') && $('pool-note').textContent.includes('共 6 局'),
  '馬車同時勾就有 6 種變化，不該標無可選位置（實際: ' + $('pool-note').textContent + '）');
setCk(['e', 'n', 'r', 'c', 'p']);
ok(!$('pool-note').textContent.includes('無可選位置'), '全勾時不標無可選位置');

setCk(['e', 'n', 'r', 'c']);
ok($('pool-note').textContent.includes('共 10803 局'), '不隨機兵（象馬車炮）＝ 10,803 局，對上 spec.md §5 的兵全原位子集');

// 5.8) 只給引擎驗證過的平衡盤面
setCk(['e', 'n', 'r', 'c', 'p']);
{
  $('ck-balanced').checked = true;
  $('ck-balanced').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok($('pool-note').textContent.includes('引擎驗證平衡 351 局'),
    '全勾＋平衡篩選 ＝ 351 局（實際: ' + $('pool-note').textContent + '）');
  const bal = new Set(window.balancedCandidates());
  let allIn = true, allMeasured = true;
  for (let i = 0; i < 20; i++) {
    click('btn-random');
    if (!bal.has(curId())) allIn = false;
    if (Math.abs(window.balancedEval(curId())) > 50) allMeasured = false;
  }
  ok(allIn, '平衡篩選下連抽 20 局都在 351 局名單內');
  ok(allMeasured, '抽到的每一局實測分數都 ≤ 50 分');
  // 與棋種勾選取交集：只隨機馬車炮時應退回原本那 70 局
  setCk(['n', 'r', 'c']);
  ok($('pool-note').textContent.includes('引擎驗證平衡 94 局'),
    '平衡篩選 ∩ 只隨機馬車炮 ＝ 94 局（實際: ' + $('pool-note').textContent + '）');
  setCk(['e', 'n', 'r', 'c', 'p']);
  $('ck-balanced').checked = false;
  $('ck-balanced').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok($('pool-note').textContent.includes('即抽即驗'), '取消平衡篩選後回到即抽即驗');
}

// 5.9) 有實測值的局面要顯示引擎評估，沒測過的不顯示
click('btn-standard');
ok($('info-eval').textContent.includes('18 分'),
  '標準開局顯示實測先手優勢 18 分（實際: ' + $('info-eval').textContent + '）');
{
  let unmeasured = 0;
  while (window.balancedEval(unmeasured) !== null || !window.checkId(unmeasured).ok) unmeasured++;
  $('posid').value = String(unmeasured);
  click('btn-goto');
  ok($('info-eval').textContent === '', '未實測過的局面不顯示評估（編號 ' + unmeasured + '）');
}

// 6) 分享：網址同步、複製按鈕有回饋
setCk(['e', 'n', 'r', 'c', 'p']);
click('btn-standard');
ok(window.location.search === '?id=3872', '網址同步為 ?id=3872（實際: ' + window.location.search + '）');
{
  $('posid').value = '0';
  click('btn-goto');
  ok(window.location.search === '?id=' + curId(), '跳轉後網址跟著更新（實際: ' + window.location.search + '）');
  click('btn-copy-fen');
  ok($('copy-note').textContent.length > 0, '按「複製 FEN」有回饋訊息（實際: ' + $('copy-note').textContent + '）');
}

// 7) 帶 ?id= 開頁會載入該局
{
  let target = 0;
  while (!window.checkId(target).ok || target === 3872) target++;
  const dom2 = new JSDOM(html, { url: BASE + '?id=' + target, runScripts: 'dangerously', pretendToBeVisual: true });
  const got = dom2.window.document.getElementById('info-id').textContent;
  ok(got === String(target), '網址 ?id=' + target + ' 開頁即載入該局（實際: ' + got + '）');
  ok(dom2.window.document.querySelectorAll('#board g.piece text').length === 32, '?id= 載入的局面同樣是 32 子');
  dom2.window.close();
}

console.log(fails === 0 ? '\n全部通過 ✔' : '\n有 ' + fails + ' 項失敗 ✘');
process.exit(fails ? 1 : 0);
