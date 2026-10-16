import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setFontFetcher, loadFont } from './fontStore';
import { buildWordmark } from './geometry';
import { DEFAULT_PARAMS } from './defaults';
import { analyzeText } from './text';

beforeAll(async () => {
  setFontFetcher(async (file) => new Uint8Array(readFileSync(`public/fonts/${file}`)));
  await Promise.all(['pretendard', 'jua', 'do-hyeon'].map(loadFont));
});

describe('analyzeText', () => {
  it('NFD 입력을 NFC로 바꾼다', () => {
    expect(analyzeText('고요'.normalize('NFD')).clean).toBe('고요');
  });
  it('허용되지 않는 글자는 제거하고 알려 준다', () => {
    const r = analyzeText('고요😀');
    expect(r.clean).toBe('고요');
    expect(r.removed).toEqual(['😀']);
  });
  it('12자로 제한한다', () => {
    const r = analyzeText('가'.repeat(20));
    expect(Array.from(r.clean)).toHaveLength(12);
    expect(r.tooLong).toBe(true);
  });
});

describe('buildWordmark', () => {
  it('글꼴이 로드되지 않았으면 null', () => {
    expect(buildWordmark('고요', { ...DEFAULT_PARAMS, fontId: 'noto-serif-kr' })).toBeNull();
  });
  it('글자 수만큼 경로를 만든다', () => {
    const wm = buildWordmark('고요', DEFAULT_PARAMS)!;
    expect(wm.paths).toHaveLength(2);
    expect(wm.bbox.w).toBeGreaterThan(1200);
  });
  it('굵기를 바꾸면 윤곽선이 달라진다 (가변 축)', () => {
    const a = buildWordmark('고요', { ...DEFAULT_PARAMS, weight: 0.1 })!;
    const b = buildWordmark('고요', { ...DEFAULT_PARAMS, weight: 0.9 })!;
    expect(a.paths[0]).not.toEqual(b.paths[0]);
  });
  it('폭을 줄이면 전체 가로 길이가 줄어든다', () => {
    const a = buildWordmark('고요', DEFAULT_PARAMS)!;
    const b = buildWordmark('고요', { ...DEFAULT_PARAMS, width: 60 })!;
    expect(b.bbox.w).toBeLessThan(a.bbox.w * 0.7);
  });
  it('자간을 늘리면 전체 길이가 늘어난다', () => {
    const a = buildWordmark('고요', DEFAULT_PARAMS)!;
    const b = buildWordmark('고요', { ...DEFAULT_PARAMS, tracking: 0.4 })!;
    expect(b.bbox.w - a.bbox.w).toBeCloseTo(400, -1);
  });
  it('기울기는 가로 범위를 넓힌다', () => {
    const a = buildWordmark('고요', DEFAULT_PARAMS)!;
    const b = buildWordmark('고요', { ...DEFAULT_PARAMS, skewOn: true, skew: 20 })!;
    expect(b.bbox.w).toBeGreaterThan(a.bbox.w);
  });
  it('글꼴에 없는 글자는 대체 글꼴로 그린다', () => {
    // 주아(Jua)는 약 2,400자만 지원 — '쀍'은 없다
    const wm = buildWordmark('쀍', { ...DEFAULT_PARAMS, fontId: 'jua', weight: 0 })!;
    expect(wm.fallbackChars).toEqual(['쀍']);
    expect(wm.paths).toHaveLength(1);
  });
  it('고정 글꼴은 굵기를 외곽선 보정으로 표현한다', () => {
    const a = buildWordmark('고요', { ...DEFAULT_PARAMS, fontId: 'do-hyeon', weight: 0 })!;
    const b = buildWordmark('고요', { ...DEFAULT_PARAMS, fontId: 'do-hyeon', weight: 1 })!;
    expect(a.strokeWidth).toBe(0);
    expect(b.strokeWidth).toBeGreaterThan(0);
  });
});

describe('모서리 굵기 보정', () => {
  it('가변 글꼴은 모서리를 둥글려도 획 두께가 크게 늘지 않는다', () => {
    const sharp = buildWordmark('이', { ...DEFAULT_PARAMS, weight: 0.5 })!;
    const round = buildWordmark('이', { ...DEFAULT_PARAMS, weight: 0.5, corner: 'round', cornerAmount: 1 })!;
    // 선 두께만큼 bbox가 커지지만, 보정이 없다면 80 이상 늘어난다.
    expect(round.bbox.w - sharp.bbox.w).toBeLessThan(sharp.bbox.w * 0.12);
    expect(round.strokeWidth).toBeGreaterThan(0);
  });
});

import { decompose, buildJamoGlyph } from './jamo';
import { DEFAULT_JAMO } from './defaults';

describe('자소 조립 엔진', () => {
  it('음절을 초성·중성·종성으로 나눈다', () => {
    expect(decompose('고')).toEqual({ initial: 'ㄱ', medial: 'ㅗ', final: '' });
    expect(decompose('닭')).toEqual({ initial: 'ㄷ', medial: 'ㅏ', final: 'ㄺ' });
    expect(decompose('A')).toBeNull();
  });
  it('11,172자 모두 오류 없이 유한한 좌표로 조립된다', () => {
    let bad = 0;
    for (let cp = 0xac00; cp <= 0xd7a3; cp++) {
      const g = buildJamoGlyph(String.fromCodePoint(cp), DEFAULT_JAMO, 0);
      if (!g || g.cmds.length === 0) bad++;
      else if (g.cmds.some((c) => c.slice(1).some((n) => !Number.isFinite(n as number)))) bad++;
    }
    expect(bad).toBe(0);
  });
  it('자소 조립 모드는 글꼴 없이 그리고, 한글이 아닌 글자는 알린다', () => {
    const wm = buildWordmark('고요A', { ...DEFAULT_PARAMS, engine: 'jamo' })!;
    expect(wm.paths).toHaveLength(2);
    expect(wm.missingChars).toEqual(['A']);
    expect(wm.fill).toBe(false);
    expect(wm.strokeWidth).toBeGreaterThan(0);
  });
  it('선 굵기와 ㅇ 열기가 형상에 반영된다', () => {
    const a = buildWordmark('아', { ...DEFAULT_PARAMS, engine: 'jamo' })!;
    const b = buildWordmark('아', { ...DEFAULT_PARAMS, engine: 'jamo', jamo: { ...DEFAULT_JAMO, circleGap: 0.2, strokeW: 0.09 } })!;
    expect(a.paths[0]).not.toEqual(b.paths[0]);
    expect(b.strokeWidth).toBeGreaterThan(a.strokeWidth);
  });
});

describe('글자별 편집', () => {
  const jamoP = { ...DEFAULT_PARAMS, engine: 'jamo' as const };
  it('지정한 글자만 바뀌고 나머지는 그대로다', () => {
    const a = buildWordmark('고요', jamoP)!;
    const b = buildWordmark('고요', { ...jamoP, glyphs: { 1: { V: { dx: 20, rot: 15 } } } })!;
    expect(b.paths[0]).toEqual(a.paths[0]);
    expect(b.paths[1]).not.toEqual(a.paths[1]);
  });
  it('글자별 선 굵기 배율이 해당 글자의 widths에만 반영된다', () => {
    const a = buildWordmark('고요', jamoP)!;
    const b = buildWordmark('고요', { ...jamoP, glyphs: { 0: { stroke: 2 } } })!;
    expect(b.widths[0]).toBeCloseTo(a.widths[0] * 2);
    expect(b.widths[1]).toBeCloseTo(a.widths[1]);
  });
  it('글자별 ㅇ 모양이 그 글자에만 적용된다', () => {
    const a = buildWordmark('아이', jamoP)!;
    const b = buildWordmark('아이', { ...jamoP, glyphs: { 1: { oShape: 'square' } } })!;
    expect(b.paths[0]).toEqual(a.paths[0]);
    expect(b.paths[1]).not.toEqual(a.paths[1]);
  });
  it('글자마다 선택 영역(boxes)이 있다', () => {
    const wm = buildWordmark('온하루', jamoP)!;
    expect(wm.boxes).toHaveLength(3);
    expect(wm.boxes[1].x).toBeGreaterThan(wm.boxes[0].x);
  });
});

import { selectableJamoIn, variantNames } from './jamo';
import { mutate, mulberry32 } from './variation';

describe('뼈대 모양 선택', () => {
  const jamoP = { ...DEFAULT_PARAMS, engine: 'jamo' as const };
  it('모양을 바꾸면 그 자모가 쓰인 글자만 달라진다', () => {
    const a = buildWordmark('가나', jamoP)!;
    const b = buildWordmark('가나', { ...jamoP, variants: { ㄱ: 2 } })!;
    expect(b.paths[0]).not.toEqual(a.paths[0]);
    expect(b.paths[1]).toEqual(a.paths[1]);
  });
  it('이 글자만 고른 모양이 전체 설정보다 우선한다', () => {
    const wm = buildWordmark('가가', { ...jamoP, variants: { ㄱ: 1 }, glyphs: { 1: { Lv: 2 } } })!;
    const plain = buildWordmark('가가', { ...jamoP, variants: { ㄱ: 1 } })!;
    expect(wm.paths[0]).toEqual(plain.paths[0]);
    expect(wm.paths[1]).not.toEqual(plain.paths[1]);
  });
  it('모든 자모의 모든 모양이 오류 없이 유한한 좌표로 그려진다', () => {
    const syllables = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ';
    for (const c of syllables) {
      for (let i = 0; i < Math.max(1, variantNames(c).length); i++) {
        const wm = buildWordmark(`${c}`, { ...jamoP, variants: { [c]: i } });
        expect(wm, `${c}#${i}`).not.toBeNull();
        expect(Number.isFinite(wm!.bbox.w)).toBe(true);
      }
    }
    for (const c of 'ㅏㅓㅣㅗㅜㅡ') {
      for (let i = 0; i < variantNames(c).length; i++) {
        const wm = buildWordmark(`고과워의`, { ...jamoP, variants: { [c]: i } })!;
        expect(Number.isFinite(wm.bbox.w)).toBe(true);
      }
    }
  });
  it('텍스트에 쓰인 자모 중 모양을 고를 수 있는 것만 나열한다', () => {
    const list = selectableJamoIn('온하루');
    expect(list).toContain('ㄴ');
    expect(list).toContain('ㅎ');
    expect(list).toContain('ㅏ');
    expect(list).not.toContain('ㅇ'); // 모양이 하나뿐
    expect(list).not.toContain('ㅁ');
  });
  it('변주 탐색이 텍스트에 쓰인 자모의 모양을 바꾼다', () => {
    let changed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = mutate(jamoP, mulberry32(seed), [], '고요');
      if (Object.keys(m.variants).length > 0) changed++;
    }
    expect(changed).toBeGreaterThan(8);
  });
});

describe('획 연결', () => {
  const jamoP = { ...DEFAULT_PARAMS, engine: 'jamo' as const };
  const withJ = (j: Partial<typeof DEFAULT_JAMO>) => ({ ...jamoP, jamo: { ...DEFAULT_JAMO, ...j } });
  it('연결을 끄면 기존 결과와 같다', () => {
    const a = buildWordmark('온하루', jamoP)!;
    const b = buildWordmark('온하루', withJ({ link: 0, linkMode: 'curve' }))!;
    expect(b.paths).toEqual(a.paths);
  });
  it('직선 잇기는 선을 더하고 곡선 잇기는 다른 모양을 만든다', () => {
    const off = buildWordmark('요', withJ({ link: 0 }))!;
    const br = buildWordmark('요', withJ({ link: 1, linkMode: 'bridge', gap: 8 }))!;
    const cu = buildWordmark('요', withJ({ link: 1, linkMode: 'curve', gap: 8 }))!;
    expect(br.paths[0].length).toBeGreaterThan(off.paths[0].length);
    expect(cu.paths[0]).not.toEqual(br.paths[0]);
  });
  it('연결 정도가 클수록 더 많은 곳이 이어진다', () => {
    const small = buildWordmark('한글', withJ({ link: 0.2, gap: 6 }))!;
    const big = buildWordmark('한글', withJ({ link: 1, gap: 6 }))!;
    const count = (w: typeof small) => w.paths.reduce((n, d) => n + (d.match(/M/g)?.length ?? 0), 0);
    expect(count(big)).toBeGreaterThanOrEqual(count(small));
  });
  it('글자별 연결 값이 전체 설정보다 우선한다', () => {
    const wm = buildWordmark('요요', { ...withJ({ link: 1, linkMode: 'bridge', gap: 8 }), glyphs: { 1: { link: 0 } } })!;
    expect(wm.paths[0].length).toBeGreaterThan(wm.paths[1].length);
  });
  it('모든 연결 방식에서 11,172자가 유한한 좌표로 조립된다', () => {
    for (const linkMode of ['bridge', 'curve', 'snap'] as const) {
      let bad = 0;
      for (let cp = 0xac00; cp <= 0xd7a3; cp += 7) {
        const g = buildJamoGlyph(String.fromCodePoint(cp), { ...DEFAULT_JAMO, link: 1, linkMode, gap: 6 }, 0);
        if (!g || g.cmds.some((c) => c.slice(1).some((n) => !Number.isFinite(n as number)))) bad++;
      }
      expect(bad).toBe(0);
    }
  });
});

import { DEFAULT_FX } from './defaults';

describe('형태 변형 효과', () => {
  const jamoP = { ...DEFAULT_PARAMS, engine: 'jamo' as const };
  const fxP = (fx: Partial<typeof DEFAULT_FX>) => ({ ...jamoP, fx: { ...DEFAULT_FX, ...fx } });
  it('효과를 끄면 기존 결과와 같다', () => {
    expect(buildWordmark('고요', fxP({}))!.paths).toEqual(buildWordmark('고요', jamoP)!.paths);
  });
  it('거칠게: 같은 시드는 같은 결과, 다른 시드는 다른 결과', () => {
    const a = buildWordmark('고요', fxP({ roughOn: true, roughSeed: 3 }))!;
    const b = buildWordmark('고요', fxP({ roughOn: true, roughSeed: 3 }))!;
    const c = buildWordmark('고요', fxP({ roughOn: true, roughSeed: 4 }))!;
    expect(a.paths).toEqual(b.paths);
    expect(a.paths).not.toEqual(c.paths);
    expect(a.paths).not.toEqual(buildWordmark('고요', jamoP)!.paths);
  });
  it('물결: 곧은 선도 휘어지고 범위가 달라진다', () => {
    const plain = buildWordmark('ㅡ', jamoP)!;
    const wave = buildWordmark('ㅡ', fxP({ waveOn: true, waveAmp: 0.2, waveLen: 0.6 }))!;
    expect(wave.bbox.h).toBeGreaterThan(plain.bbox.h + 100);
  });
  it('부풀림: 글자 범위가 커지고, 오므림은 작아진다', () => {
    const plain = buildWordmark('아', jamoP)!;
    const big = buildWordmark('아', fxP({ bulgeOn: true, bulgeAmount: 1 }))!;
    const small = buildWordmark('아', fxP({ bulgeOn: true, bulgeAmount: -0.6 }))!;
    expect(big.bbox.w).toBeGreaterThan(plain.bbox.w);
    expect(small.bbox.w).toBeLessThan(plain.bbox.w);
  });
  it('글꼴 모드에서도 효과가 적용된다', async () => {
    const wm = buildWordmark('고요', { ...DEFAULT_PARAMS, fx: { ...DEFAULT_FX, waveOn: true } })!;
    expect(wm.paths[0]).toMatch(/^M[-\d.]+ [-\d.]+L/);
  });
  it('줄무늬: 띠가 만들어지고 줄 수만큼 늘어난다', () => {
    const few = buildWordmark('고요', fxP({ stripeOn: true, stripeCount: 4 }))!;
    const many = buildWordmark('고요', fxP({ stripeOn: true, stripeCount: 20 }))!;
    expect(few.cuts.length).toBeGreaterThan(0);
    expect(many.cuts.length).toBeGreaterThan(few.cuts.length);
    expect(buildWordmark('고요', jamoP)!.cuts).toEqual([]);
  });
});
