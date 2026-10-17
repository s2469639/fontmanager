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

import { flowMerge, reverseOpen } from './flow';
import type { Cmd } from './types';

describe('한 획으로 이어 그리기', () => {
  const pathCount = (cmds: Cmd[]) => cmds.filter((c) => c[0] === 'M').length;
  const jamoP = { ...DEFAULT_PARAMS, engine: 'jamo' as const };
  const flowP = (link: number, gap = 6) => ({ ...jamoP, jamo: { ...DEFAULT_JAMO, link, linkMode: 'flow' as const, gap } });

  it('경로를 거꾸로 뒤집었다가 다시 뒤집으면 원래와 같다', () => {
    const cmds: Cmd[] = [['M', 0, 0], ['L', 10, 0], ['Q', 20, 0, 20, 10], ['C', 20, 20, 10, 30, 0, 30]];
    expect(reverseOpen(reverseOpen(cmds))).toEqual(cmds);
    const r = reverseOpen(cmds);
    expect(r[0]).toEqual(['M', 0, 30]);
  });

  it('끝과 끝이 방향이 맞게 가까우면 하나의 경로로 합친다', () => {
    // 오른쪽으로 가던 선의 끝(10,0) 바로 앞에서, 같은 방향으로 이어지는 선이 시작
    const cmds: Cmd[] = [['M', 0, 0], ['L', 10, 0], ['M', 16, 0], ['L', 30, 0]];
    const merged = flowMerge(cmds, 20);
    expect(pathCount(merged)).toBe(1);
    expect(merged.some((c) => c[0] === 'C')).toBe(true);
  });

  it('완만하게 꺾이는 연결은 하고, 연결선과 직각으로 마주 서는 연결은 하지 않는다', () => {
    // 오른쪽으로 가던 선이 비스듬히 아래로 이어지는 선을 만나는 것은 자연스러운 흐름
    expect(pathCount(flowMerge([['M', 0, 0], ['L', 10, 0], ['M', 14, 3], ['L', 14, 30]], 20))).toBe(1);
    // 같은 높이에서 세로선이 정면으로 가로막는 경우(연결선과 직각)는 이을 수 없다
    expect(pathCount(flowMerge([['M', 0, 0], ['L', 10, 0], ['M', 14, 0], ['L', 14, 30]], 20))).toBe(2);
  });

  it('다른 획을 가로지르는 연결은 하지 않는다', () => {
    const cmds: Cmd[] = [['M', 0, 0], ['L', 10, 0], ['M', 16, 0], ['L', 30, 0], ['M', 13, -10], ['L', 13, 10]];
    expect(pathCount(flowMerge(cmds, 20))).toBe(3);
  });

  it('거리가 범위 밖이면 그대로 둔다', () => {
    const cmds: Cmd[] = [['M', 0, 0], ['L', 10, 0], ['M', 60, 0], ['L', 80, 0]];
    expect(flowMerge(cmds, 20)).toEqual(cmds);
  });

  it('연결을 끄면 기존 결과와 같고, 켜면 경로 수가 줄거나 같다', () => {
    for (const w of ['고요한', '온하루', '담아', '꿈꾸는']) {
      const off = buildWordmark(w, flowP(0))!;
      const on = buildWordmark(w, flowP(1))!;
      const count = (x: typeof on) => x.paths.reduce((n, d) => n + (d.match(/M/g)?.length ?? 0), 0);
      expect(count(on)).toBeLessThanOrEqual(count(off));
    }
    expect(buildWordmark('고요', flowP(0))!.paths).toEqual(buildWordmark('고요', { ...jamoP, jamo: { ...DEFAULT_JAMO, link: 0, gap: 6 } })!.paths);
  });

  it('11,172자가 한 획 모드에서도 유한한 좌표로, 합리적인 시간 안에 조립된다', () => {
    const t0 = Date.now();
    let bad = 0;
    for (let cp = 0xac00; cp <= 0xd7a3; cp += 3) {
      const g = buildJamoGlyph(String.fromCodePoint(cp), { ...DEFAULT_JAMO, link: 1, linkMode: 'flow', gap: 8 }, 0);
      if (!g || g.cmds.some((c) => c.slice(1).some((n) => !Number.isFinite(n as number)))) bad++;
    }
    expect(bad).toBe(0);
    expect(Date.now() - t0).toBeLessThan(15000);
  });
});

import { editableStrokes, jamoCharsIn, nodesToCmds, skeletonStrokePath } from './jamo';
import type { SkelStroke } from './types';

describe('뼈대 직접 그리기', () => {
  const jamoP = { ...DEFAULT_PARAMS, engine: 'jamo' as const };

  it('기본 모양을 편집할 수 있는 점으로 바꾼다 (직각 ㄱ은 꺾이는 점 3개)', () => {
    const st = editableStrokes('ㄱ', 0);
    expect(st).toHaveLength(1);
    expect(st[0].t).toBe('path');
    if (st[0].t === 'path') {
      expect(st[0].nodes).toHaveLength(3);
      expect(st[0].nodes.every((n) => !n.s)).toBe(true);
    }
  });

  it('곡선 모양은 부드러운 점으로 바뀌고, ㅇ은 고리로 남는다', () => {
    const curve = editableStrokes('ㄱ', 2)[0];
    expect(curve.t === 'path' && curve.nodes.some((n) => n.s)).toBe(true);
    expect(editableStrokes('ㅇ', 0)[0].t).toBe('ring');
  });

  it('모든 자모의 모든 기본 모양을 편집용으로 바꿔도 점이 유한하다', () => {
    for (const ch of 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅣㅗㅛㅜㅠㅡ') {
      for (let i = 0; i < 4; i++) {
        const strokes = editableStrokes(ch, i);
        expect(strokes.length).toBeGreaterThan(0);
        for (const s of strokes) expect(skeletonStrokePath(s)).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('직접 그린 뼈대는 그 자모가 쓰인 글자에만 적용된다', () => {
    const custom: Record<string, SkelStroke[]> = {
      ㄱ: [{ t: 'path', nodes: [{ x: 0, y: 0 }, { x: 1, y: 0.4 }, { x: 0.3, y: 1 }] }],
    };
    const a = buildWordmark('가나', jamoP)!;
    const b = buildWordmark('가나', { ...jamoP, skeletons: custom })!;
    expect(b.paths[0]).not.toEqual(a.paths[0]);
    expect(b.paths[1]).toEqual(a.paths[1]);
  });

  it('직접 그린 뼈대는 자모별 모양 선택보다 우선하지만, 글자별로 고른 모양에는 양보한다', () => {
    const custom: Record<string, SkelStroke[]> = {
      ㄱ: [{ t: 'path', nodes: [{ x: 0, y: 0 }, { x: 1, y: 0.4 }, { x: 0.3, y: 1 }] }],
    };
    const base = buildWordmark('가가', { ...jamoP, skeletons: custom })!;
    const withVariant = buildWordmark('가가', { ...jamoP, skeletons: custom, variants: { ㄱ: 2 } })!;
    expect(withVariant.paths).toEqual(base.paths);
    const forced = buildWordmark('가가', { ...jamoP, skeletons: custom, glyphs: { 1: { Lv: 0 } } })!;
    expect(forced.paths[0]).toEqual(base.paths[0]);
    expect(forced.paths[1]).not.toEqual(base.paths[1]);
  });

  it('부드러운 점이 있으면 곡선이 만들어지고, 모두 꺾임이면 꺾은선이다', () => {
    const corner = nodesToCmds([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], false, 0);
    expect(corner.some((c) => c[0] === 'C')).toBe(false);
    const smooth = nodesToCmds([{ x: 0, y: 0 }, { x: 10, y: 0, s: true }, { x: 10, y: 10 }], false, 0);
    expect(smooth.some((c) => c[0] === 'C')).toBe(true);
  });

  it('텍스트에 쓰인 기본 자모를 풀어서 나열한다', () => {
    const list = jamoCharsIn('꿈은');
    expect(list).toEqual(expect.arrayContaining(['ㄱ', 'ㅜ', 'ㅁ', 'ㅇ', 'ㅡ', 'ㄴ']));
    expect(new Set(list).size).toBe(list.length);
  });

  it('11,172자가 직접 그린 뼈대(모든 자모에 적용)에서도 유한한 좌표로 조립된다', () => {
    const custom: Record<string, SkelStroke[]> = {};
    for (const ch of 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅣㅗㅛㅜㅠㅡ') {
      custom[ch] = editableStrokes(ch, 1).map((s) =>
        s.t === 'path' ? { ...s, nodes: s.nodes.map((n) => ({ ...n, x: n.x * 0.9 + 0.05 })) } : s,
      );
    }
    let bad = 0;
    for (let cp = 0xac00; cp <= 0xd7a3; cp += 5) {
      const g = buildJamoGlyph(String.fromCodePoint(cp), DEFAULT_JAMO, 0, undefined, undefined, custom);
      if (!g || g.cmds.some((c) => c.slice(1).some((n) => !Number.isFinite(n as number)))) bad++;
    }
    expect(bad).toBe(0);
  });
});

import { addHooks } from './hook';

describe('부리와 반대로 엇갈림', () => {
  const jamoP = { ...DEFAULT_PARAMS, engine: 'jamo' as const };
  const withJ = (j: Partial<typeof DEFAULT_JAMO>) => ({ ...jamoP, jamo: { ...DEFAULT_JAMO, ...j } });

  it('부리를 끄면 기존 결과와 같다', () => {
    expect(buildWordmark('고요', withJ({ hookStart: 0, hookEnd: 0 }))!.paths).toEqual(buildWordmark('고요', jamoP)!.paths);
  });

  it('획의 시작점에 직각으로 꺾인 부리가 붙는다', () => {
    // 왼쪽→오른쪽 가로획: 시작점에서 아래(+y)로 꺾임
    const out = addHooks([['M', 10, 10], ['L', 50, 10]], { start: 1, end: 0, style: 'tick', flip: false });
    expect(out[0]).toEqual(['M', 10, 10 + 14]);
    expect(out[1]).toEqual(['L', 10, 10]);
  });

  it('끝점 부리는 반대쪽(위)으로 꺾이고, 뒤집으면 방향이 바뀐다', () => {
    const end = addHooks([['M', 10, 10], ['L', 50, 10]], { start: 0, end: 1, style: 'tick', flip: false });
    expect(end[end.length - 1]).toEqual(['L', 50, 10 - 14]);
    const flipped = addHooks([['M', 10, 10], ['L', 50, 10]], { start: 0, end: 1, style: 'tick', flip: true });
    expect(flipped[flipped.length - 1]).toEqual(['L', 50, 10 + 14]);
  });

  it('짧은 획에는 획 길이의 일부까지만 부리가 붙는다', () => {
    const out = addHooks([['M', 10, 10], ['L', 20, 10]], { start: 1, end: 0, style: 'tick', flip: false });
    const tip = out[0] as ['M', number, number];
    expect(tip[2] - 10).toBeCloseTo(4); // 길이 10의 40%
  });

  it('다른 획에 닿은 끝에는 부리를 붙이지 않는다', () => {
    // ㅗ처럼 줄기 끝이 가로선 위에 닿아 있음
    const cmds: Cmd[] = [['M', 0, 50], ['L', 100, 50], ['M', 50, 50], ['L', 50, 0]];
    const out = addHooks(cmds, { start: 1, end: 1, style: 'tick', flip: false });
    // 줄기의 시작점(50,50)은 가로선에 닿아 있으므로 부리가 붙지 않고, 줄기의 끝(50,0)에만 붙는다
    const stemStart = out.findIndex((c) => c[0] === 'M' && c[1] === 50 && c[2] === 50);
    expect(stemStart).toBeGreaterThan(-1);
    expect(out.filter((c) => c[0] === 'M')).toHaveLength(2);
  });

  it('비스듬한 부리는 직각 부리와 다른 위치로 뻗는다', () => {
    const a = addHooks([['M', 10, 10], ['L', 50, 10]], { start: 1, end: 0, style: 'tick', flip: false });
    const b = addHooks([['M', 10, 10], ['L', 50, 10]], { start: 1, end: 0, style: 'beak', flip: false });
    expect(a[0]).not.toEqual(b[0]);
  });

  it('11,172자가 부리를 켜도 유한한 좌표로 조립된다', () => {
    let bad = 0;
    for (let cp = 0xac00; cp <= 0xd7a3; cp += 5) {
      const g = buildJamoGlyph(String.fromCodePoint(cp), { ...DEFAULT_JAMO, hookStart: 1, hookEnd: 1, hookStyle: 'beak', link: 1, linkMode: 'flow' }, 0);
      if (!g || g.cmds.some((c) => c.slice(1).some((n) => !Number.isFinite(n as number)))) bad++;
    }
    expect(bad).toBe(0);
  });

  it('위아래 어긋남을 음수로 하면 반대 방향으로 엇갈린다', () => {
    const pos = buildWordmark('가나', withJ({ bounce: 0.1 }))!;
    const neg = buildWordmark('가나', withJ({ bounce: -0.1 }))!;
    const flat = buildWordmark('가나', withJ({ bounce: 0 }))!;
    // 첫 글자: 양수면 위로, 음수면 아래로 (y는 아래가 +)
    expect(pos.boxes[0].y).toBeLessThan(flat.boxes[0].y);
    expect(neg.boxes[0].y).toBeGreaterThan(flat.boxes[0].y);
    // 둘째 글자는 반대
    expect(pos.boxes[1].y).toBeGreaterThan(flat.boxes[1].y);
    expect(neg.boxes[1].y).toBeLessThan(flat.boxes[1].y);
  });
});
