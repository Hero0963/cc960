// cc960 — 演示頁無頭迴歸測試（16 項）
// 用法：npm test（需先 npm install 取得 jsdom，且先 npm run build 產生 docs/index.html）
// 測的是「建置後的成品」而非原始碼，因此組裝流程壞掉也會被抓到。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) fails++; };

// 1) 載入後：標準開局（編號 3872）、32 子
ok($('info-id-wrap').textContent.includes('3872'), '開場為標準開局編號 3872（實際: ' + $('info-id-wrap').textContent + '）');
ok($('info-mob').textContent === '44 著', '標準局面機動力 44 著（實際: ' + $('info-mob').textContent + '）');
ok(doc.querySelectorAll('#board g.piece text').length === 32, '棋盤上有 32 枚棋子');

// 2) 模擬點擊走子：炮 b3 → e3（中炮），再吃中卒
const svg = $('board');
svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 554 });
const click = (c, r) => {
  const x = 34 + c * 54, y = 34 + (9 - r) * 54;
  svg.dispatchEvent(new window.MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
};
click(1, 2); click(4, 2);
ok($('moves').textContent.includes('炮b3–e3'), '走子 炮b3–e3');
click(7, 7); click(4, 7);
click(4, 2); click(4, 6);
ok($('moves').textContent.includes('炮e3×e7卒'), '紅炮吃中卒記譜含 ×');
$('btn-undo').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(doc.querySelectorAll('#moves li').length === 2, '悔棋後剩 2 著');

// 3) 點對稱驗證：隨機一局後，黑(9-r,8-c) 應與 紅(r,c) 同型異色
$('btn-random').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(doc.querySelectorAll('#moves li').length === 0, '隨機一局後棋譜清空');
{
  const id = parseInt($('info-id-wrap').textContent.match(/\d+/)[0], 10);
  const bd = window.setupFromId(id);
  let bad = 0;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = bd[r][c], q = bd[9 - r][8 - c];
    if ((p === null) !== (q === null)) { bad++; continue; }
    if (p && (p.t !== q.t || p.c === q.c)) bad++;
  }
  ok(bad === 0, '隨機局面點對稱成立（編號 ' + id + '，違反格數 ' + bad + '）');
}

// 4) 跳轉到不合法編號 → 自動跳至最近合法編號並提示
let badId = 0;
while (window.checkId(badId).ok) badId++;
$('posid').value = String(badId);
$('btn-goto').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const note = $('gen-note').textContent;
ok(note.includes('不合法') && note.includes('已跳至'), '不合法編號自動跳轉並提示（badId=' + badId + '，實際: ' + note + '）');

// 5) 輕量版：216 局全合法、標準開局 = #122
$('mode').value = 'lite';
$('mode').dispatchEvent(new window.Event('change', { bubbles: true }));
ok($('info-id-wrap').textContent.includes('／216'), '輕量版共 216 局面（實際: ' + $('info-id-wrap').textContent + '）');
$('btn-standard').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok($('info-id-wrap').textContent.includes('#122／216'), '標準開局＝輕量版 #122（實際: ' + $('info-id-wrap').textContent + '）');
$('posid').value = '1';
$('btn-goto').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok($('info-id-wrap').textContent.includes('#1／216'), '跳轉至輕量版 #1');

// 6) 軸對稱版：146 局、標準開局 = #21、抽一局驗證自身左右對稱
$('mode').value = 'sym';
$('mode').dispatchEvent(new window.Event('change', { bubbles: true }));
ok($('info-id-wrap').textContent.includes('／146'), '軸對稱版共 146 局面（實際: ' + $('info-id-wrap').textContent + '）');
$('btn-standard').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok($('info-id-wrap').textContent.includes('#21／146'), '標準開局＝軸對稱版 #21（實際: ' + $('info-id-wrap').textContent + '）');
$('btn-random').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
{
  const id = parseInt($('info-id-wrap').textContent.match(/編號 (\d+)/)[1], 10);
  const bd = window.setupFromId(id);
  let bad = 0;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = bd[r][c], ax = bd[r][8 - c];
    if ((p === null) !== (ax === null)) { bad++; continue; }
    if (p && (p.t !== ax.t || p.c !== ax.c)) bad++;
  }
  ok(bad === 0, '軸對稱版隨機局面自身左右對稱（編號 ' + id + '，違反格數 ' + bad + '）');
}

// 6.5) 平衡版：70 局（引擎驗證過的名單）、標準開局在池內、全數通過靜置檢定
$('mode').value = 'balanced';
$('mode').dispatchEvent(new window.Event('change', { bubbles: true }));
ok($('info-id-wrap').textContent.includes('／70'), '平衡版共 70 局面（實際: ' + $('info-id-wrap').textContent + '）');
$('btn-standard').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok($('info-id-wrap').textContent.includes('／70') && $('info-id-wrap').textContent.includes('編號 3872'),
  '標準開局在平衡版池內（實際: ' + $('info-id-wrap').textContent + '）');
{
  // 名單是實測結果，硬編在 setup.js；至少要保證每一局都仍然合法且是輕量版的子集
  const lite = new Set(window.liteCandidates());
  const bad = window.balancedCandidates().filter(id => !window.checkId(id).ok || !lite.has(id));
  ok(bad.length === 0, '平衡版 70 局全數合法且屬輕量版子集（違反 ' + bad.length + ' 局）');
}
{
  // 名單是實測結果，介面必須主動說明驗證手法（引擎、深度、閾值），不能只留在摺疊的規則區
  const note = $('gen-note').textContent;
  ok(note.includes('Pikafish') && note.includes('40'),
    '平衡版會顯示驗證手法（實際開頭: ' + note.slice(0, 28) + '…）');
}

// 7) 切回完整版、連抽 5 局皆完整
$('mode').value = 'full';
$('mode').dispatchEvent(new window.Event('change', { bubbles: true }));
let allOk = true;
for (let i = 0; i < 5; i++) {
  $('btn-random').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  if (doc.querySelectorAll('#board g.piece text').length !== 32) allOk = false;
}
ok(allOk, '連抽 5 局皆為完整 32 子局面');

console.log(fails === 0 ? '\n全部通過 ✔' : '\n有 ' + fails + ' 項失敗 ✘');
process.exit(fails ? 1 : 0);
