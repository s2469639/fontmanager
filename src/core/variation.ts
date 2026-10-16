import type { Cap, Corner, OShape, Params } from './types';
import { LIMITS } from './defaults';
import { getFont } from '../data/fonts';
import { selectableJamoIn, variantNames } from './jamo';

/** 시드가 같으면 같은 변주를 만드는 난수 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const jitter = (rng: () => number, amount: number) => (rng() * 2 - 1) * amount;

/**
 * 기준 시안 주변의 이웃 시안을 만듭니다.
 * 기준에서 너무 멀어지지 않도록 변화 폭을 제한하고, 효과는 낮은 확률로만 켭니다.
 */
function mutateJamo(center: Params, rng: () => number, text: string): Params {
  const p: Params = { ...center, jamo: { ...center.jamo }, variants: { ...center.variants } };
  // 텍스트에 실제로 쓰인 자모의 뼈대 모양을 바꿔 눈에 보이는 변주를 만듭니다.
  const chars = selectableJamoIn(text);
  const flips = rng() < 0.7 ? (rng() < 0.3 ? 2 : 1) : 0;
  for (let i = 0; i < flips && chars.length; i++) {
    const c = chars[Math.floor(rng() * chars.length)];
    const n = variantNames(c).length;
    const cur = p.variants[c] ?? 0;
    const next = (cur + 1 + Math.floor(rng() * (n - 1))) % n;
    if (next === 0) delete p.variants[c];
    else p.variants[c] = next;
  }
  const j = p.jamo;
  j.strokeW = Math.round(clamp(j.strokeW + jitter(rng, 0.02), LIMITS.strokeW.min, LIMITS.strokeW.max) * 1000) / 1000;
  if (rng() < 0.3) {
    const caps: Cap[] = ['round', 'butt', 'square'];
    j.cap = caps[Math.floor(rng() * 3)];
  }
  j.roundness = Math.round(clamp(j.roundness + jitter(rng, 0.5), 0, 1) * 100) / 100;
  j.consonantScale = Math.round(clamp(j.consonantScale + jitter(rng, 0.2), 0.7, 1.2) * 100) / 100;
  j.vowelScale = Math.round(clamp(j.vowelScale + jitter(rng, 0.2), 0.7, 1.2) * 100) / 100;
  j.gap = Math.round(clamp(j.gap + jitter(rng, 8), -4, 16));
  if (rng() < 0.3) {
    const shapes: OShape[] = ['circle', 'square', 'diamond'];
    j.oShape = shapes[Math.floor(rng() * 3)];
  }
  if (rng() < 0.3) j.circleGap = Math.round((0.08 + rng() * 0.2) * 100) / 100;
  else if (rng() < 0.3) j.circleGap = 0;
  if (rng() < 0.2) j.bounce = Math.round((0.02 + rng() * 0.06) * 1000) / 1000;
  p.width = Math.round(clamp(center.width + jitter(rng, 18), 70, 130));
  p.tracking = Math.round(clamp(center.tracking + jitter(rng, 0.1), -0.08, 0.3) * 100) / 100;
  if (rng() < 0.2) {
    p.skewOn = true;
    p.skew = Math.round((rng() < 0.5 ? -1 : 1) * (6 + rng() * 10));
  }
  if (rng() < 0.12) {
    p.overlapOn = true;
    p.overlapAmount = 0.08 + rng() * 0.12;
  }
  return p;
}

export function mutate(center: Params, rng: () => number, siblings: string[], text = ''): Params {
  if (center.engine === 'jamo') return mutateJamo(center, rng, text);
  const p: Params = { ...center };

  if (rng() < 0.3) {
    const others = siblings.filter((f) => f !== center.fontId);
    p.fontId = others[Math.floor(rng() * others.length)] ?? center.fontId;
    const kind = getFont(p.fontId).weight.kind;
    p.weight = kind === 'axis' ? 0.25 + rng() * 0.55 : rng() * 0.5;
  } else {
    p.weight = clamp(center.weight + jitter(rng, 0.3), LIMITS.weight.min, LIMITS.weight.max);
  }

  p.width = Math.round(clamp(center.width + jitter(rng, 22), 58, 135));
  p.tracking = Math.round(clamp(center.tracking + jitter(rng, 0.1), -0.12, 0.35) * 100) / 100;

  if (rng() < 0.3) {
    const corners: Corner[] = ['sharp', 'round', 'bevel'];
    p.corner = corners[Math.floor(rng() * 3)];
    p.cornerAmount = 0.3 + rng() * 0.6;
  }
  if (rng() < 0.2) {
    p.skewOn = true;
    p.skew = Math.round((rng() < 0.5 ? -1 : 1) * (6 + rng() * 10));
  }
  if (rng() < 0.15) {
    p.vScaleOn = true;
    p.vScale = Math.round(clamp(center.vScale + jitter(rng, 30), 70, 135));
  }
  if (rng() < 0.1) {
    p.outlineOn = true;
    p.outlineWidth = 0.014 + rng() * 0.02;
  }
  if (rng() < 0.12) {
    p.overlapOn = true;
    p.overlapAmount = 0.08 + rng() * 0.12;
  }
  return p;
}

/** 기준 시안과 비교해 무엇이 달라졌는지 짧은 말로 설명합니다. */
function describeJamoDiff(p: Params, base: Params): string[] {
  const tags: string[] = [];
  const a = p.jamo;
  const b = base.jamo;
  // 뼈대 모양이 바뀐 자모를 먼저 알려 줍니다.
  for (const c of new Set([...Object.keys(p.variants), ...Object.keys(base.variants)])) {
    const i = p.variants[c] ?? 0;
    if (i !== (base.variants[c] ?? 0)) tags.push(`${c} ${variantNames(c)[i] ?? '기본'}`);
  }
  const ds = a.strokeW - b.strokeW;
  if (Math.abs(ds) > 0.01) tags.push(ds > 0 ? '더 굵은 선' : '더 가는 선');
  if (a.cap !== b.cap) tags.push(a.cap === 'round' ? '둥근 끝' : a.cap === 'square' ? '각진 끝' : '평평한 끝');
  const dr = a.roundness - b.roundness;
  if (Math.abs(dr) > 0.3) tags.push(dr > 0 ? '꺾임 둥글게' : '꺾임 날카롭게');
  if (a.oShape !== b.oShape) tags.push(a.oShape === 'circle' ? 'ㅇ 원' : a.oShape === 'square' ? 'ㅇ 네모' : 'ㅇ 마름모');
  if (a.circleGap > 0.04 && b.circleGap <= 0.04) tags.push('열린 ㅇ');
  if (a.circleGap <= 0.04 && b.circleGap > 0.04) tags.push('닫힌 ㅇ');
  const dc = a.consonantScale - b.consonantScale;
  if (Math.abs(dc) > 0.1) tags.push(dc > 0 ? '초성 크게' : '초성 작게');
  const dv = a.vowelScale - b.vowelScale;
  if (Math.abs(dv) > 0.1) tags.push(dv > 0 ? '모음 크게' : '모음 작게');
  if (Math.abs(a.gap - b.gap) > 5) tags.push(a.gap > b.gap ? '초성·모음 멀게' : '초성·모음 붙게');
  if (a.bounce > 0.015 && b.bounce <= 0.015) tags.push('위아래 어긋남');
  if (Math.abs(p.width - base.width) > 8) tags.push(p.width > base.width ? '더 넓게' : '더 좁게');
  const dt = p.tracking - base.tracking;
  if (Math.abs(dt) > 0.05) tags.push(dt > 0 ? '자간 넓게' : '자간 좁게');
  if (p.skewOn && !base.skewOn) tags.push(p.skew > 0 ? '오른쪽 기울기' : '왼쪽 기울기');
  if (p.overlapOn && !base.overlapOn) tags.push('겹침');
  return tags.length ? tags.slice(0, 3) : ['미세 조정'];
}

export function describeDiff(p: Params, base: Params): string[] {
  if (p.engine === 'jamo' && base.engine === 'jamo') return describeJamoDiff(p, base);
  const tags: string[] = [];
  if (p.fontId !== base.fontId) tags.push(getFont(p.fontId).nameKo);
  const dw = p.weight - base.weight;
  if (p.fontId === base.fontId && Math.abs(dw) > 0.12) tags.push(dw > 0 ? '더 굵게' : '더 가늘게');
  if (Math.abs(p.width - base.width) > 8) tags.push(p.width > base.width ? '더 넓게' : '더 좁게');
  const dt = p.tracking - base.tracking;
  if (Math.abs(dt) > 0.04) tags.push(dt > 0 ? '자간 넓게' : '자간 좁게');
  if (p.corner !== base.corner) tags.push(p.corner === 'round' ? '둥글게' : p.corner === 'bevel' ? '모서리 깎기' : '모서리 날카롭게');
  if (p.skewOn && !base.skewOn) tags.push(p.skew > 0 ? '오른쪽 기울기' : '왼쪽 기울기');
  if (p.vScaleOn && !base.vScaleOn) tags.push(p.vScale > 100 ? '세로로 길게' : '세로로 납작하게');
  if (p.outlineOn && !base.outlineOn) tags.push('외곽선');
  if (p.overlapOn && !base.overlapOn) tags.push('겹침');
  return tags.length ? tags.slice(0, 3) : ['미세 조정'];
}
