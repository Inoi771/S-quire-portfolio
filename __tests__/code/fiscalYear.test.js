require('../helpers/gas-mocks');
const { getCurrentFiscalYear } = require('../../students');

describe('getCurrentFiscalYear', () => {
  const RealDate = global.Date;

  afterEach(() => {
    global.Date = RealDate;
  });

  function mockDate(isoString) {
    const fixed = new RealDate(isoString);
    global.Date = class MockDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixed.getTime());
          return;
        }
        super(...args);
      }
    };
    // getFullYear等が呼べるようにprototype経由で正しく動くことを確認
    global.Date.prototype = RealDate.prototype;
  }

  test('4月1日は当年の年度を返す', () => {
    mockDate('2025-04-01T00:00:00');
    expect(getCurrentFiscalYear()).toBe(2025);
  });

  test('12月31日は当年の年度を返す', () => {
    mockDate('2025-12-31T00:00:00');
    expect(getCurrentFiscalYear()).toBe(2025);
  });

  test('1月1日は前年の年度を返す', () => {
    mockDate('2026-01-01T00:00:00');
    expect(getCurrentFiscalYear()).toBe(2025);
  });

  test('3月31日は前年の年度を返す', () => {
    mockDate('2026-03-31T00:00:00');
    expect(getCurrentFiscalYear()).toBe(2025);
  });

  test('6月中旬は当年の年度を返す', () => {
    mockDate('2025-06-15T00:00:00');
    expect(getCurrentFiscalYear()).toBe(2025);
  });

  test('2月は前年の年度を返す', () => {
    mockDate('2026-02-15T00:00:00');
    expect(getCurrentFiscalYear()).toBe(2025);
  });
});
