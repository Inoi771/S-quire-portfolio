const fn = require('../helpers/frontend-functions');

describe('buildCampusOptions', () => {
  const campuses = [
    { code: '01', name: '本校' },
    { code: '02', name: '北校' },
    { code: '03', name: '南校' }
  ];

  beforeEach(() => {
    fn._setGlobal('preferredCampuses', []);
  });

  test('デフォルトのプレースホルダーでオプションHTMLを生成する', () => {
    const html = fn.buildCampusOptions(campuses);
    expect(html).toContain('<option value="">選択してください</option>');
    expect(html).toContain('<option value="01">本校</option>');
    expect(html).toContain('<option value="02">北校</option>');
    expect(html).toContain('<option value="03">南校</option>');
  });

  test('カスタムプレースホルダーを使用する', () => {
    const html = fn.buildCampusOptions(campuses, '校舎を選ぶ');
    expect(html).toContain('<option value="">校舎を選ぶ</option>');
  });

  test('よく行く校舎が先頭に来る', () => {
    fn._setGlobal('preferredCampuses', ['03']);
    const html = fn.buildCampusOptions(campuses);
    const idx03 = html.indexOf('value="03"');
    const idx01 = html.indexOf('value="01"');
    expect(idx03).toBeLessThan(idx01);
  });

  test('複数のよく行く校舎が先頭に来る', () => {
    fn._setGlobal('preferredCampuses', ['03', '02']);
    const html = fn.buildCampusOptions(campuses);
    const idx03 = html.indexOf('value="03"');
    const idx02 = html.indexOf('value="02"');
    const idx01 = html.indexOf('value="01"');
    expect(idx03).toBeLessThan(idx01);
    expect(idx02).toBeLessThan(idx01);
  });

  test('空の校舎リストではプレースホルダーのみ返す', () => {
    const html = fn.buildCampusOptions([]);
    expect(html).toBe('<option value="">選択してください</option>');
  });

  test('preferredCampusesに存在しないコードがあっても安全', () => {
    fn._setGlobal('preferredCampuses', ['99']);
    const html = fn.buildCampusOptions(campuses);
    expect(html).toContain('value="01"');
    expect(html).toContain('value="02"');
    expect(html).toContain('value="03"');
  });
});
