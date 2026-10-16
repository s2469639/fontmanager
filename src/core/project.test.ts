import { describe, expect, it } from 'vitest';
import { APP_ID, ProjectError, parseProject, sanitizeParams, serializeProject } from './project';
import { DEFAULT_PARAMS, DEFAULT_JAMO, LIMITS } from './defaults';
import { directionOf } from '../data/styles';

const base = { app: APP_ID, version: 1, text: '다농', params: DEFAULT_PARAMS, baseline: null, baselineLabel: '', bg: 'light', art: [] };

describe('작업 파일', () => {
  it('저장한 내용을 그대로 다시 읽는다', async () => {
    const params = {
      ...directionOf('open').params,
      glyphs: { 1: { L: { scale: 1.4, rot: 20 }, oShape: 'square' as const, Vv: 2, link: 0.3 } },
      variants: { ㄱ: 2 },
    };
    const json = await serializeProject({ text: '다농', params, baseline: params, baselineLabel: '열린', bg: 'dark', art: [] }, false);
    const parsed = parseProject(json);
    expect(parsed.text).toBe('다농');
    expect(parsed.params).toEqual(params);
    expect(parsed.baseline).toEqual(params);
    expect(parsed.bg).toBe('dark');
  });

  it('JSON이 아니거나 다른 앱의 파일이면 알려 준다', () => {
    expect(() => parseProject('not json')).toThrow(ProjectError);
    expect(() => parseProject(JSON.stringify({ app: 'other' }))).toThrow(ProjectError);
    expect(() => parseProject('[]')).toThrow(ProjectError);
  });

  it('더 새로운 버전의 파일은 열지 않는다', () => {
    expect(() => parseProject(JSON.stringify({ ...base, version: 99 }))).toThrow(/새로운 버전/);
  });

  it('이름이 비어 있으면 열지 않는다', () => {
    expect(() => parseProject(JSON.stringify({ ...base, text: '😀😀' }))).toThrow(ProjectError);
  });

  it('값이 범위를 벗어나거나 형식이 틀리면 안전한 값으로 맞춘다', () => {
    const evil = {
      ...base,
      params: {
        engine: 'hack',
        fontId: '../../etc/passwd',
        width: 1e9,
        tracking: 'NaN',
        color: 'url(javascript:alert(1))',
        jamo: { strokeW: -5, cap: 'x', link: 99, linkMode: 7 },
        fx: { stripeCount: 1e9, roughSeed: 1.5, waveAxis: 'z', stripeOn: 'yes' },
        glyphs: { '-1': { stroke: 5 }, '500': { stroke: 5 }, '0': { stroke: 1e9, Lv: 99, L: { scale: 1e9 } } },
        variants: { ㄱ: 3, x: 1, ㄴ: 100 },
      },
    };
    const p = parseProject(JSON.stringify(evil)).params;
    expect(p.engine).toBe(DEFAULT_PARAMS.engine);
    expect(p.fontId).toBe(DEFAULT_PARAMS.fontId);
    expect(p.width).toBe(LIMITS.width.max);
    expect(p.tracking).toBe(DEFAULT_PARAMS.tracking);
    expect(p.color).toBe('auto');
    expect(p.jamo.strokeW).toBe(LIMITS.strokeW.min);
    expect(p.jamo.cap).toBe(DEFAULT_JAMO.cap);
    expect(p.jamo.link).toBe(1);
    expect(p.jamo.linkMode).toBe(DEFAULT_JAMO.linkMode);
    expect(p.fx.stripeCount).toBe(LIMITS.stripeCount.max);
    expect(p.fx.roughSeed).toBe(2);
    expect(p.fx.waveAxis).toBe('y');
    expect(p.fx.stripeOn).toBe(false);
    expect(Object.keys(p.glyphs)).toEqual(['0']);
    expect(p.glyphs[0].stroke).toBe(8);
    expect(p.glyphs[0].Lv).toBeUndefined();
    expect(p.glyphs[0].L?.scale).toBe(4);
    expect(p.variants).toEqual({ ㄱ: 3 });
  });

  it('올바르지 않은 그림 데이터는 버린다', () => {
    const art = [
      { name: 'ok.png', data: 'data:image/png;base64,iVBORw0KGgo=' },
      { name: 'bad', data: 'data:text/html;base64,PHNjcmlwdD4=' },
      { name: 'bad2', data: 'https://example.com/a.png' },
      { name: 'bad3', data: 'javascript:alert(1)' },
    ];
    const parsed = parseProject(JSON.stringify({ ...base, art }));
    expect(parsed.art).toHaveLength(1);
    expect(parsed.art[0].name).toBe('ok.png');
  });

  it('빈 값이 들어와도 항상 유효한 설정을 만든다', () => {
    expect(sanitizeParams(undefined)).toEqual(DEFAULT_PARAMS);
    expect(sanitizeParams(null)).toEqual(DEFAULT_PARAMS);
    expect(sanitizeParams(42)).toEqual(DEFAULT_PARAMS);
  });
});
