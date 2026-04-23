// Jest 設定（Phase 6-B-05 で新規整備・Phase 6-B-06 で functions/ も transform 対象に拡張）
//
// 既存テスト（__tests__/code/ / __tests__/frontend/）は CommonJS 形式・non-strict で
// 動作していた前提のため、babel transform の適用範囲を `workers/src/` 配下の
// ESM ファイルのみに限定する。
//
// - 既存 CommonJS テスト: transform 対象外 → non-strict のまま動く
// - 新規テスト (__tests__/workers-helpers/): import で helpers / functions をロードするため
//   テストファイル自身と import 先の ESM ファイルが babel-jest で CommonJS にトランスパイルされる
// - Phase 6-B-06 で `workers/src/helpers/` → `workers/src/` に拡張（API 層 functions/ も対象）

module.exports = {
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '__tests__/helpers/'],
  transform: {
    'workers/src/.*\\.js$': 'babel-jest',
    '__tests__/workers-helpers/.*\\.test\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: ['/node_modules/']
};
