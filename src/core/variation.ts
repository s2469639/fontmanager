import type { Corner, Params } from './types';
import { LIMITS } from './defaults';
import { getFont } from '../data/fonts';

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
export function mutate(center: Params, rng: () => number, siblings: string[]): Params {
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
export function describeDiff(p: Params, base: Params): string[] {
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
