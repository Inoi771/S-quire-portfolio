/**
 * GAS グローバル変数のモック
 * code.js の関数をテストするために必要な最低限のモックを提供
 */

global.Logger = {
  log: jest.fn()
};

global.PropertiesService = {
  getScriptProperties: jest.fn().mockReturnValue({
    getProperty: jest.fn(),
    setProperty: jest.fn(),
    getProperties: jest.fn().mockReturnValue({})
  }),
  getUserProperties: jest.fn().mockReturnValue({
    getProperty: jest.fn(),
    setProperty: jest.fn(),
    getProperties: jest.fn().mockReturnValue({})
  })
};
