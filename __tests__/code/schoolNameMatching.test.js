require('../helpers/gas-mocks');
const { buildSchoolLookup, matchSchoolName, getDefaultDept } = require('../../admin');

describe('buildSchoolLookup', () => {
  test('正式名称をnameMapに登録する', () => {
    const lookup = buildSchoolLookup([
      { name: '鳴門渦潮高校', departments: ['普通科'] }
    ]);
    expect(lookup.nameMap['鳴門渦潮高校']).toBe('鳴門渦潮高校');
  });

  test('高校の略称パターンを生成する', () => {
    const lookup = buildSchoolLookup([
      { name: '鳴門渦潮高校', departments: ['普通科'] }
    ]);
    expect(lookup.nameMap['鳴門渦潮']).toBe('鳴門渦潮高校');
    expect(lookup.nameMap['鳴門渦潮高等学校']).toBe('鳴門渦潮高校');
  });

  test('中学校の略称パターンを生成する', () => {
    const lookup = buildSchoolLookup([
      { name: '徳島中学校', departments: [] }
    ]);
    expect(lookup.nameMap['徳島']).toBe('徳島中学校');
    expect(lookup.nameMap['徳島中学']).toBe('徳島中学校');
  });

  test('高等学校の略称パターンを生成する', () => {
    const lookup = buildSchoolLookup([
      { name: '城北高等学校', departments: [] }
    ]);
    expect(lookup.nameMap['城北']).toBe('城北高等学校');
    expect(lookup.nameMap['城北高校']).toBe('城北高等学校');
  });

  test('「中学」のみの場合もサフィックス除去する', () => {
    const lookup = buildSchoolLookup([
      { name: '城東中学', departments: [] }
    ]);
    expect(lookup.nameMap['城東']).toBe('城東中学');
  });

  test('null入力で空の結果を返す', () => {
    expect(buildSchoolLookup(null)).toEqual({ schools: [], nameMap: {} });
  });

  test('空配列で空の結果を返す', () => {
    expect(buildSchoolLookup([])).toEqual({ schools: [], nameMap: {} });
  });

  test('schoolsプロパティにname/departmentsを含む', () => {
    const lookup = buildSchoolLookup([
      { name: '城北高校', departments: ['普通科', '理数科'] }
    ]);
    expect(lookup.schools).toHaveLength(1);
    expect(lookup.schools[0].name).toBe('城北高校');
    expect(lookup.schools[0].departments).toEqual(['普通科', '理数科']);
  });
});

describe('matchSchoolName', () => {
  const schoolConfig = [
    { name: '鳴門渦潮高校', departments: ['普通科', '体育科'] },
    { name: '城北高校', departments: ['普通科'] },
    { name: '徳島中学校', departments: [] }
  ];
  const lookup = buildSchoolLookup(schoolConfig);

  test('完全一致で正式名称を返す', () => {
    expect(matchSchoolName('鳴門渦潮高校', lookup).name).toBe('鳴門渦潮高校');
  });

  test('略称一致で正式名称を返す', () => {
    expect(matchSchoolName('鳴門渦潮', lookup).name).toBe('鳴門渦潮高校');
  });

  test('高等学校→高校の変換でマッチする', () => {
    expect(matchSchoolName('鳴門渦潮高等学校', lookup).name).toBe('鳴門渦潮高校');
  });

  test('中学→中学校の変換でマッチする', () => {
    expect(matchSchoolName('徳島中学', lookup).name).toBe('徳島中学校');
  });

  test('部分一致（核が入力に含まれる）でマッチする', () => {
    const result = matchSchoolName('渦潮', lookup);
    expect(result.name).toBe('鳴門渦潮高校');
  });

  test('nullで空オブジェクトを返す', () => {
    expect(matchSchoolName(null, lookup)).toEqual({ name: '', dept: '' });
  });

  test('空文字で空オブジェクトを返す', () => {
    expect(matchSchoolName('', lookup)).toEqual({ name: '', dept: '' });
  });

  test('マッチしない場合は入力値をそのまま返す', () => {
    const result = matchSchoolName('未知の学校', lookup);
    expect(result.name).toBe('未知の学校');
    expect(result.dept).toBe('');
  });

  test('学科が1つの学校では自動選択する', () => {
    expect(matchSchoolName('城北高校', lookup).dept).toBe('普通科');
  });

  test('学科が複数の学校では自動選択しない', () => {
    expect(matchSchoolName('鳴門渦潮高校', lookup).dept).toBe('');
  });

  test('lookupがnullの場合、入力値をそのまま返す', () => {
    const result = matchSchoolName('テスト高校', null);
    expect(result.name).toBe('テスト高校');
    expect(result.dept).toBe('');
  });
});

describe('getDefaultDept', () => {
  const lookup = buildSchoolLookup([
    { name: 'A高校', departments: ['普通科'] },
    { name: 'B高校', departments: ['普通科', '理数科'] },
    { name: 'C高校', departments: [] }
  ]);

  test('学科が1つなら返す', () => {
    expect(getDefaultDept('A高校', lookup)).toBe('普通科');
  });

  test('学科が複数なら空文字を返す', () => {
    expect(getDefaultDept('B高校', lookup)).toBe('');
  });

  test('学科がないなら空文字を返す', () => {
    expect(getDefaultDept('C高校', lookup)).toBe('');
  });

  test('存在しない学校は空文字を返す', () => {
    expect(getDefaultDept('未知', lookup)).toBe('');
  });
});
