#!/usr/bin/env node
/**
 * S-quire ビルドスクリプト
 * GAS テンプレート構文 <?!= include('filename') ?> を解決して
 * Firebase Hosting 用の静的 index.html を public/ に生成する。
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC_DIR  = path.join(__dirname, '..');
const DIST_DIR = path.join(__dirname, '..', 'public');
const SRC_HTML = path.join(SRC_DIR, 'index.html');
const OUT_HTML = path.join(DIST_DIR, 'index.html');

// <?!= include("filename") ?> または <?!= include('filename') ?> にマッチ
const INCLUDE_RE = /<\?!=\s*include\(\s*["']([^"']+)["']\s*\)\s*\?>/g;

/**
 * インクルードファイル名 → 対応 .html ファイルの内容を返す
 * @param {string} name  例: "styles" / "firebase-init" / "js-core"
 * @returns {string}
 */
function resolveInclude(name) {
  const filePath = path.join(SRC_DIR, name + '.html');
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ ファイルが見つかりません: ${filePath}`);
    return `<!-- include(${name}) not found -->`;
  }
  return fs.readFileSync(filePath, 'utf8');
}

// ----- メイン処理 -----

console.log('=== S-quire ビルド開始 ===');

if (!fs.existsSync(SRC_HTML)) {
  console.error('❌ index.html が見つかりません:', SRC_HTML);
  process.exit(1);
}

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

let html   = fs.readFileSync(SRC_HTML, 'utf8');
let count  = 0;

html = html.replace(INCLUDE_RE, (match, name) => {
  console.log(`  ✓ include("${name}")`);
  count++;
  return resolveInclude(name);
});

fs.writeFileSync(OUT_HTML, html, 'utf8');

console.log(`=== ビルド完了: ${count} ファイルをインライン展開 → public/index.html ===`);
