// Jest 設定（Phase 6-B-05 で新規整備）
//
// 既存テスト（__tests__/code/ / __tests__/frontend/）は CommonJS 形式・non-strict で
// 動作していた前提のため、babel transform の適用範囲を `workers/src/helpers/` 配下の
// ESM ファイルのみに限定する。
//
// - 既存 CommonJS テスト: transform 対象外 → non-strict のまま動く
// - 新規テスト (__tests__/workers-helpers/): 動的 import で helpers をロードするため
//   テストファイル自身は transform 不要。動的 import 先の ESM ファイルのみ babel-jest で
//   CommonJS にトランスパイルされる。

module.exports = {
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '__tests__/helpers/'],
  transform: {
    'workers/src/helpers/.*\\.js$': 'babel-jest',
    '__tests__/workers-helpers/.*\\.test\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: ['/node_modules/']
};
