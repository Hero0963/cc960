// cc960 — 組裝演示頁：src/shell.html ＋ 三個 js 內聯 → docs/index.html（單檔、可離線開）
// 用法：npm run build
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'docs', 'index.html');

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const shell = read('shell.html');

const inner = shell
  .replace('/*__RULES__*/', () => read('rules.js'))
  .replace('/*__SETUP__*/', () => read('setup.js'))
  .replace('/*__UI__*/', () => read('ui.js'));

const splitAt = inner.indexOf('</style>') + '</style>'.length;
const html = '<!DOCTYPE html>\n<html lang="zh-Hant">\n<head>\n<meta charset="UTF-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  + '<meta name="description" content="cc960：借鑑 Chess960 的隨機開局中國象棋，走法不變、只隨機開局擺放，合法開局 172,848 種。">\n'
  + inner.slice(0, splitAt) + '\n</head>\n<body>'
  + inner.slice(splitAt) + '\n</body>\n</html>\n';

fs.writeFileSync(OUT, html);
console.log('built', path.relative(ROOT, OUT), '—', html.length, 'bytes');
