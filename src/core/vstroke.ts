/**
 * 굵기 대비 (가로획은 가늘게, 세로획은 굵게)
 *
 * 같은 굵기의 선(stroke) 대신, 획이 향하는 방향에 따라 굵기가 달라지는 "면"으로 바꿉니다.
 * 수평으로 가는 구간은 가늘고, 수직으로 가는 구간은 굵으며, 비스듬한 곳은 그 사이입니다.
 * 곡선(ㅇ, 둥근 모서리)에서는 굵기가 부드럽게 변해 붓/명조 같은 리듬이 생깁니다.
 *
 * 구현: 경로를 짧은 선분으로 쪼갠 뒤 선분마다 사다리꼴(굵기가 변하는 띠)을 만들고,
 * 꺾이는 곳과 끝에는 이음새·끝 모양 조각을 더합니다. 모든 조각의 방향(시계/반시계)을
 * 같게 맞춰 두어서, 겹친 부분이 nonzero 채우기에서 구멍 없이 하나로 합쳐집니다.
 * 좌표는 설계 좌표(0..100, y 아래로)입니다.
 */
import type { Cap, Cmd } from './types';

type Pt = [number, number];

export interface VStrokeOptions {
  /** 수평 획의 굵기, 수직 획의 굵기 (설계 단위) */
  widthH: number;
  widthV: number;
  cap: Cap;
  join: 'round' | 'miter' | 'bevel';
  miterLimit: number;
  /** 부리 끝점들: 이 점에서는 굵기를 tipScale배로 줄여 삼각형 부리처럼 만듭니다. */
  tips?: Pt[];
  tipScale?: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const unit = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]);
  return l < 1e-9 ? [1, 0] : [v[0] / l, v[1] / l];
};
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];

/** 이 각도(도)보다 크게 꺾이면 '모서리', 그보다 작으면 부드러운 곡선의 한 점으로 봅니다. */
const CORNER_DEG = 28;
/** 이음새 조각을 더할 최소 꺾임(도). 이보다 작으면 사다리꼴만으로 충분히 이어 보입니다. */
const JOIN_MIN_DEG = 3;

interface Sub {
  pts: Pt[];
  closed: boolean;
}

function toSubs(cmds: Cmd[]): Sub[] {
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let pen: Pt = [0, 0];
  const push = (p: Pt) => {
    if (!cur) return;
    const last = cur.pts[cur.pts.length - 1];
    if (!last || dist(last, p) > 1e-6) cur.pts.push(p);
  };
  for (const c of cmds) {
    if (c[0] === 'M') {
      cur = { pts: [], closed: false };
      subs.push(cur);
      pen = [c[1], c[2]];
      push(pen);
    } else if (!cur) {
      continue;
    } else if (c[0] === 'L') {
      pen = [c[1], c[2]];
      push(pen);
    } else if (c[0] === 'Q') {
      const N = 14;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        push([u * u * pen[0] + 2 * u * t * c[1] + t * t * c[3], u * u * pen[1] + 2 * u * t * c[2] + t * t * c[4]]);
      }
      pen = [c[3], c[4]];
    } else if (c[0] === 'C') {
      const N = 18;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        push([
          u * u * u * pen[0] + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
          u * u * u * pen[1] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
        ]);
      }
      pen = [c[5], c[6]];
    } else {
      cur.closed = true;
      if (cur.pts.length > 1 && dist(cur.pts[0], cur.pts[cur.pts.length - 1]) < 1e-6) cur.pts.pop();
    }
  }
  return subs.filter((s) => s.pts.length >= 2);
}

/** 모든 조각을 같은 방향으로 통일해 nonzero 채우기에서 합집합이 되게 합니다. */
function normalized(poly: Pt[]): Cmd[] {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  const pts = a < 0 ? [...poly].reverse() : poly;
  const out: Cmd[] = pts.map((p, i): Cmd => [i === 0 ? 'M' : 'L', p[0], p[1]]);
  out.push(['Z']);
  return out;
}

function circle(c: Pt, r: number): Pt[] {
  const n = Math.max(10, Math.min(24, Math.round(r * 5)));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * 방향(단위벡터)에 따른 굵기: 수평이면 widthH, 수직이면 widthV.
 * 수평·수직 근처에서 굵기가 뾰족하게 꺾이지 않도록 제곱으로 섞습니다.
 */
function widthAt(d: Pt, o: VStrokeOptions): number {
  const s = d[1] * d[1]; // 0(수평) … 1(수직)
  return o.widthH + (o.widthV - o.widthH) * s;
}

/** 긴 직선 구간은 끝까지 같은 굵기를 유지합니다. (이보다 짧은 구간만 이웃과 부드럽게 섞음) */
const STRAIGHT_LEN = 8;

export function variableStroke(cmds: Cmd[], o: VStrokeOptions): Cmd[] {
  const out: Cmd[] = [];
  const emit = (poly: Pt[]) => out.push(...normalized(poly));

  for (const sub of toSubs(cmds)) {
    const { pts, closed } = sub;
    const n = pts.length;
    const m = closed ? n : n - 1;
    if (m < 1) continue;

    // 선분 방향과 법선(왼쪽)
    const dirs: Pt[] = [];
    for (let k = 0; k < m; k++) dirs.push(unit([pts[(k + 1) % n][0] - pts[k][0], pts[(k + 1) % n][1] - pts[k][1]]));
    const normals: Pt[] = dirs.map((d) => [-d[1], d[0]]);

    /** 꼭짓점 i에서 들어오는 선분과 나가는 선분 (열린 경로의 양 끝은 한쪽만 있음) */
    const segIn = (i: number) => (closed ? (i - 1 + m) % m : i - 1);
    const segOut = (i: number) => (closed ? i % m : i);
    const hasIn = (i: number) => closed || i > 0;
    const hasOut = (i: number) => closed || i < m;
    const turnDeg = (i: number) => {
      if (!hasIn(i) || !hasOut(i)) return 0;
      const c = Math.max(-1, Math.min(1, dot(dirs[segIn(i)], dirs[segOut(i)])));
      return (Math.acos(c) * 180) / Math.PI;
    };

    const isTip = (i: number) => !!o.tips?.some((t) => dist(t, pts[i]) < 1e-4);
    const segLen = (k: number) => dist(pts[k], pts[(k + 1) % n]);

    /** 꼭짓점 i에서 선분 k 쪽으로 쓰는 굵기의 절반 */
    const halfAt = (i: number, k: number) => {
      const base = halfBase(i, k);
      return isTip(i) ? base * (o.tipScale ?? 0.25) : base;
    };
    const halfBase = (i: number, k: number) => {
      const t = turnDeg(i);
      if (!hasIn(i) || !hasOut(i) || t >= CORNER_DEG || segLen(k) > STRAIGHT_LEN) return widthAt(dirs[k], o) / 2;
      // 부드럽게 이어지는 곳은 양쪽 방향의 평균으로 굵기가 서서히 변하게 합니다.
      return widthAt(unit([dirs[segIn(i)][0] + dirs[segOut(i)][0], dirs[segIn(i)][1] + dirs[segOut(i)][1]]), o) / 2;
    };

    // 1) 선분마다 굵기가 변하는 사다리꼴
    for (let k = 0; k < m; k++) {
      const p0 = pts[k];
      const p1 = pts[(k + 1) % n];
      const h0 = halfAt(k, k);
      const h1 = halfAt((k + 1) % n, k);
      const nv = normals[k];
      emit([
        [p0[0] + nv[0] * h0, p0[1] + nv[1] * h0],
        [p1[0] + nv[0] * h1, p1[1] + nv[1] * h1],
        [p1[0] - nv[0] * h1, p1[1] - nv[1] * h1],
        [p0[0] - nv[0] * h0, p0[1] - nv[1] * h0],
      ]);
    }

    // 2) 꺾이는 곳의 이음새
    for (let i = 0; i < n; i++) {
      const t = turnDeg(i);
      if (t < JOIN_MIN_DEG) continue;
      const a = segIn(i);
      const b = segOut(i);
      const p = pts[i];
      const hA = halfAt(i, a);
      const hB = halfAt(i, b);
      // 바깥쪽: 꺾이는 방향의 반대편
      const s = dot(dirs[b], normals[a]) > 0 ? -1 : 1;
      const o1: Pt = [p[0] + normals[a][0] * s * hA, p[1] + normals[a][1] * s * hA];
      const o2: Pt = [p[0] + normals[b][0] * s * hB, p[1] + normals[b][1] * s * hB];

      const style = t < CORNER_DEG ? 'bevel' : o.join;
      if (style === 'round') {
        const a1 = Math.atan2(normals[a][1] * s, normals[a][0] * s);
        let a2 = Math.atan2(normals[b][1] * s, normals[b][0] * s);
        let da = a2 - a1;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        a2 = a1 + da;
        const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 12)));
        const poly: Pt[] = [p, o1];
        for (let q = 1; q < steps; q++) {
          const f = q / steps;
          const ang = a1 + da * f;
          const r = hA + (hB - hA) * f;
          poly.push([p[0] + Math.cos(ang) * r, p[1] + Math.sin(ang) * r]);
        }
        poly.push(o2);
        emit(poly);
      } else if (style === 'miter') {
        // 두 바깥 모서리선의 교점이 한도 안이면 뾰족하게, 아니면 깎습니다.
        const dA = dirs[a];
        const dB = dirs[b];
        const det = dA[0] * dB[1] - dA[1] * dB[0];
        let poly: Pt[] = [p, o1, o2];
        if (Math.abs(det) > 1e-6) {
          const tt = ((o2[0] - o1[0]) * dB[1] - (o2[1] - o1[1]) * dB[0]) / det;
          const mp: Pt = [o1[0] + dA[0] * tt, o1[1] + dA[1] * tt];
          if (dist(mp, p) <= o.miterLimit * Math.max(hA, hB)) poly = [p, o1, mp, o2];
        }
        emit(poly);
      } else {
        emit([p, o1, o2]);
      }
    }

    // 3) 열린 획의 양 끝 모양
    if (!closed) {
      const ends: { i: number; k: number; out: Pt }[] = [
        { i: 0, k: 0, out: [-dirs[0][0], -dirs[0][1]] },
        { i: n - 1, k: m - 1, out: dirs[m - 1] },
      ];
      for (const e of ends) {
        const p = pts[e.i];
        const h = widthAt(dirs[e.k], o) / 2;
        if (o.cap === 'round') {
          emit(circle(p, h));
        } else if (o.cap === 'square') {
          const nv = normals[e.k];
          emit([
            [p[0] + nv[0] * h, p[1] + nv[1] * h],
            [p[0] + nv[0] * h + e.out[0] * h, p[1] + nv[1] * h + e.out[1] * h],
            [p[0] - nv[0] * h + e.out[0] * h, p[1] - nv[1] * h + e.out[1] * h],
            [p[0] - nv[0] * h, p[1] - nv[1] * h],
          ]);
        }
      }
    }
  }
  return out;
}
