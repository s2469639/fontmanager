import { describe, expect, it } from 'vitest';
import { simplifyFreehand } from './freehand';

type Pt = [number, number];
const line = (a: Pt, b: Pt, n = 40): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt);

describe('손으로 그린 선 단순화', () => {
  it('곧은 선은 점 두 개로 줄어든다', () => {
    const s = simplifyFreehand(line([0.1, 0.1], [0.9, 0.1]))!;
    expect(s.t).toBe('path');
    if (s.t === 'path') {
      expect(s.nodes).toHaveLength(2);
      expect(s.closed).toBeUndefined();
    }
  });

  it('손떨림이 있어도 곧은 선은 곧게 편다', () => {
    const noisy = line([0.1, 0.5], [0.9, 0.5], 80).map(([x, y], i) => [x, y + (i % 2 ? 0.004 : -0.004)] as Pt);
    const s = simplifyFreehand(noisy)!;
    expect(s.t === 'path' && s.nodes.length).toBeLessThanOrEqual(3);
  });

  it('ㄱ처럼 꺾이는 선은 모서리를 꺾임 점으로 남긴다', () => {
    const pts = [...line([0.1, 0.1], [0.9, 0.1]), ...line([0.9, 0.1], [0.9, 0.9]).slice(1)];
    const s = simplifyFreehand(pts)!;
    expect(s.t).toBe('path');
    if (s.t === 'path') {
      expect(s.nodes).toHaveLength(3);
      const corner = s.nodes[1];
      expect(corner.x).toBeCloseTo(0.9, 1);
      expect(corner.y).toBeCloseTo(0.1, 1);
      expect(corner.s).toBeUndefined(); // 꺾임
    }
  });

  it('완만한 곡선의 중간 점은 부드러움으로 정한다', () => {
    const arc: Pt[] = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 59) * Math.PI;
      return [0.5 + Math.cos(a) * 0.4, 0.8 - Math.sin(a) * 0.5] as Pt;
    });
    const s = simplifyFreehand(arc)!;
    expect(s.t === 'path' && s.nodes.slice(1, -1).every((n) => n.s)).toBe(true);
  });

  it('처음과 끝이 만나는 원은 닫힌 도형이 된다', () => {
    const circle: Pt[] = Array.from({ length: 80 }, (_, i) => {
      const a = (i / 79) * Math.PI * 2;
      return [0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3] as Pt;
    });
    const s = simplifyFreehand(circle)!;
    expect(s.t === 'path' && s.closed).toBe(true);
    if (s.t === 'path') {
      expect(s.nodes.length).toBeGreaterThanOrEqual(5);
      expect(s.nodes.every((n) => n.s)).toBe(true);
    }
  });

  it('끝이 벌어진 원(열린 ㅇ)은 닫지 않는다', () => {
    const open: Pt[] = Array.from({ length: 80 }, (_, i) => {
      const a = (i / 79) * Math.PI * 1.55;
      return [0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3] as Pt;
    });
    const s = simplifyFreehand(open)!;
    expect(s.t === 'path' && s.closed).toBeUndefined();
  });

  it('너무 짧거나 점이 거의 없으면 획으로 만들지 않는다', () => {
    expect(simplifyFreehand([])).toBeNull();
    expect(simplifyFreehand([[0.5, 0.5]])).toBeNull();
    expect(simplifyFreehand(line([0.5, 0.5], [0.52, 0.5], 10))).toBeNull();
  });

  it('복잡하게 구불거려도 점 개수 상한을 지킨다', () => {
    const wiggle: Pt[] = Array.from({ length: 400 }, (_, i) => {
      const t = i / 399;
      return [0.1 + t * 0.8, 0.5 + Math.sin(t * Math.PI * 14) * 0.3] as Pt;
    });
    const s = simplifyFreehand(wiggle, { maxNodes: 20 })!;
    expect(s.t === 'path' && s.nodes.length).toBeLessThanOrEqual(20);
  });

  it('좌표가 숫자가 아닌 점은 무시한다', () => {
    const pts = [...line([0.1, 0.1], [0.9, 0.1]), [NaN, 0.3] as Pt, [0.9, Infinity] as Pt];
    const s = simplifyFreehand(pts)!;
    expect(s.t === 'path' && s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });
});
