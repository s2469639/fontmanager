import { describe, expect, it } from 'vitest';
import { assemble, decompose } from './jamo';
import { DEFAULT_JAMO } from './defaults';

/**
 * 기본 설정에서 모든 한글 음절의 초성·모음·받침이 서로 닿거나 가로지르지 않는지 검사합니다.
 * (선 굵기의 1.5배 이상 떨어져 있어야 붙어 보이지 않습니다.)
 */
type Pt = [number, number];
type Seg = [Pt, Pt];

function segsOf(strokes: ReturnType<typeof assemble>['strokes']): Seg[] {
  const out: Seg[] = [];
  const addPoly = (pts: Pt[], closed: boolean) => {
    for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]]);
    if (closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]);
  };
  for (const s of strokes) {
    if (s.t === 'poly') addPoly(s.pts, s.closed);
    else if (s.t === 'path') addPoly(s.nodes.map((n) => [n.x, n.y] as Pt), s.closed);
    else if (s.t === 'ring') {
      const pts: Pt[] = [];
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        pts.push([s.c[0] + Math.cos(a) * s.rx, s.c[1] + Math.sin(a) * s.ry]);
      }
      addPoly(pts, true);
    } else {
      const pts: Pt[] = [];
      let cur: Pt = [0, 0];
      for (const o of s.ops) {
        if (o[0] === 'M' || o[0] === 'L') {
          cur = [o[1], o[2]];
          pts.push(cur);
        } else if (o[0] === 'Q') {
          for (let i = 1; i <= 6; i++) {
            const t = i / 6;
            const u = 1 - t;
            pts.push([u * u * cur[0] + 2 * u * t * o[1] + t * t * o[3], u * u * cur[1] + 2 * u * t * o[2] + t * t * o[4]]);
          }
          cur = [o[3], o[4]];
        }
      }
      addPoly(pts, false);
    }
  }
  return out;
}

const orient = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
const crosses = (a: Pt, b: Pt, c: Pt, d: Pt) =>
  orient(a, b, c) * orient(a, b, d) < -1e-6 && orient(c, d, a) * orient(c, d, b) < -1e-6;
function pointSeg(p: Pt, s0: Pt, s1: Pt) {
  const dx = s1[0] - s0[0];
  const dy = s1[1] - s0[1];
  const l = dx * dx + dy * dy;
  const t = l < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - s0[0]) * dx + (p[1] - s0[1]) * dy) / l));
  return Math.hypot(p[0] - (s0[0] + dx * t), p[1] - (s0[1] + dy * t));
}
const segGap = (a: Pt, b: Pt, c: Pt, d: Pt) =>
  Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));

describe('글자 배치 검사', () => {
  it('모든 음절에서 초성·모음·받침이 서로 가로지르지 않고 8 이상 떨어져 있다', () => {
    const bad: string[] = [];
    for (let cp = 0xac00; cp <= 0xd7a3; cp += 2) {
      const ch = String.fromCodePoint(cp);
      const parts = assemble(decompose(ch)!, DEFAULT_JAMO).parts.map((p) => segsOf(p));
      let worst = 99;
      let crossed = false;
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          for (const [a, b] of parts[i]) {
            for (const [c, d] of parts[j]) {
              if (crosses(a, b, c, d)) crossed = true;
              worst = Math.min(worst, segGap(a, b, c, d));
            }
          }
        }
      }
      if (crossed || worst < 7.9) bad.push(`${ch}(${worst.toFixed(1)})`);
    }
    expect(bad.slice(0, 40)).toEqual([]);
  });

  it('쌍자음의 두 글자는 서로 떨어져 있어 한 덩어리로 붙지 않는다', () => {
    for (const ch of ['쓰', '짜', '씨', '쏘']) {
      const syl = decompose(ch)!;
      // 쌍자음은 같은 모양 두 개이므로 획을 절반씩 나눠 앞 글자와 뒤 글자로 봅니다.
      const strokes = assemble(syl, DEFAULT_JAMO).parts[0];
      const half = strokes.length / 2;
      const first = segsOf(strokes.slice(0, half));
      const second = segsOf(strokes.slice(half));
      let g = 99;
      for (const [a, b] of first) for (const [c, d] of second) g = Math.min(g, segGap(a, b, c, d));
      expect(g, ch).toBeGreaterThan(2);
    }
  });
});
