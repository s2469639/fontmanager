/**
 * 손으로 그린 선 → 뼈대 획
 *
 * 펜·손가락·마우스로 그은 수많은 점을 편집할 수 있는 몇 개의 점으로 줄입니다.
 *  1) 떨림을 줄이기 위해 이동 평균으로 살짝 다듬고
 *  2) Ramer–Douglas–Peucker로 꼭 필요한 점만 남기고
 *  3) 크게 꺾이는 곳은 '꺾임' 점으로, 나머지는 '부드러움' 점으로 정합니다.
 *  4) 처음과 끝이 만나면 닫힌 도형(ㅇ 같은 고리)으로 만듭니다.
 * 좌표는 0..1 상자 기준입니다.
 */
import type { SkelNode, SkelStroke } from './types';

type Pt = [number, number];

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function pathLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return dist(p, [a[0] + dx * t, a[1] + dy * t]);
}

/** Ramer–Douglas–Peucker: eps보다 벗어난 점만 남깁니다. (재귀 대신 스택으로) */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i], pts[s], pts[e]);
      if (d > worst) {
        worst = d;
        idx = i;
      }
    }
    if (worst > eps && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** 이웃 세 점의 이동 평균. 처음과 끝점은 그대로 둡니다. */
function smoothPts(pts: Pt[]): Pt[] {
  if (pts.length < 4) return pts;
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = pts[i - 1];
    const b = pts[i + 1];
    return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4] as Pt;
  });
}

/** 세 점 a→b→c에서 진행 방향이 꺾이는 각도(도) */
function turnDeg(a: Pt, b: Pt, c: Pt): number {
  const v1: Pt = [b[0] - a[0], b[1] - a[1]];
  const v2: Pt = [c[0] - b[0], c[1] - b[1]];
  const l1 = Math.hypot(v1[0], v1[1]);
  const l2 = Math.hypot(v2[0], v2[1]);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export interface FreehandOptions {
  /** 점 개수 상한 (기본 22) */
  maxNodes?: number;
  /** 이 각도(도)보다 크게 꺾이면 모서리로 둡니다. (기본 52) */
  cornerDeg?: number;
}

/**
 * 손으로 그린 점들을 뼈대 획 하나로 바꿉니다. 너무 짧거나 점 하나뿐이면 null.
 */
export function simplifyFreehand(raw: Pt[], opt: FreehandOptions = {}): SkelStroke | null {
  const maxNodes = opt.maxNodes ?? 22;
  const cornerDeg = opt.cornerDeg ?? 52;

  // 1) 거의 같은 자리의 점은 하나로
  const pts: Pt[] = [];
  for (const p of raw) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (!pts.length || dist(pts[pts.length - 1], p) > 0.002) pts.push(p);
  }
  const len = pathLength(pts);
  if (pts.length < 3 || len < 0.06) return null;

  // 2) 닫힌 도형 판정: 시작과 끝이 가깝고 충분히 큰 선
  const closed = len > 0.45 && dist(pts[0], pts[pts.length - 1]) < Math.max(0.08, len * 0.12);
  let work = pts;
  if (closed) work = [...pts.slice(0, -1)]; // 끝점은 시작점과 만나므로 뺌

  // 3) 떨림 줄이기 → 점 줄이기
  work = smoothPts(smoothPts(work));
  let eps = 0.012;
  let simple = closed ? rdp([...work, work[0]], eps).slice(0, -1) : rdp(work, eps);
  while (simple.length > maxNodes && eps < 0.3) {
    eps *= 1.25;
    simple = closed ? rdp([...work, work[0]], eps).slice(0, -1) : rdp(work, eps);
  }
  const minNodes = closed ? 3 : 2;
  if (simple.length < minNodes) return null;

  // 4) 모서리/부드러움 판정
  const n = simple.length;
  const nodes: SkelNode[] = simple.map((p, i) => {
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const node: SkelNode = { x: round(p[0]), y: round(p[1]) };
    const interior = closed || (i > 0 && i < n - 1);
    if (interior && n >= 3) {
      const a = simple[(i - 1 + n) % n];
      const c = simple[(i + 1) % n];
      if (turnDeg(a, p, c) <= cornerDeg) node.s = true;
    }
    return node;
  });

  return closed ? { t: 'path', nodes, closed: true } : { t: 'path', nodes };
}
