/**
 * 부리(획 끝 꺾기)
 *
 * 명조체의 부리처럼, 획이 시작하거나 끝나는 자리를 작게 꺾어 줍니다.
 * 꺾인 부분은 같은 경로의 연장이라 선 끝 모양·꺾임 모양(둥글게/각지게)을 그대로 따릅니다.
 *
 * 다른 획에 닿아 있는 끝(ㅗ의 줄기 끝, ㅂ의 가운데 줄 등)과 획 연결로 이어진 곳에는 붙지 않습니다.
 * 좌표는 설계 좌표(0..100, y 아래로)입니다.
 */
import type { Cmd } from './types';

type Pt = [number, number];

export interface HookOptions {
  /** 시작점 부리 크기 0..1 */
  start: number;
  /** 끝점 부리 크기 0..1 */
  end: number;
  /** tick: 진행 방향에 직각으로 꺾음 / beak: 뒤쪽으로 비스듬히 뻗는 부리 */
  style: 'tick' | 'beak';
  /** true면 꺾이는 쪽을 반대로 */
  flip: boolean;
}

/** 부리 최대 길이(설계 단위) = 크기 × 이 값 */
export const HOOK_MAX = 14;
/** 부리는 그 획 길이의 이 비율을 넘지 않습니다. (짧은 획이 부리에 먹히지 않게) */
const HOOK_MAX_RATIO = 0.4;

function pathLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const unit = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

interface Piece {
  cmds: Cmd[];
  closed: boolean;
  pts: Pt[];
}

function sample(cmds: Cmd[]): Pt[] {
  const pts: Pt[] = [];
  let cur: Pt = [0, 0];
  for (const c of cmds) {
    if (c[0] === 'M' || c[0] === 'L') {
      cur = [c[1], c[2]];
      pts.push(cur);
    } else if (c[0] === 'Q') {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        pts.push([u * u * cur[0] + 2 * u * t * c[1] + t * t * c[3], u * u * cur[1] + 2 * u * t * c[2] + t * t * c[4]]);
      }
      cur = [c[3], c[4]];
    } else if (c[0] === 'C') {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        pts.push([
          u * u * u * cur[0] + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
          u * u * u * cur[1] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
        ]);
      }
      cur = [c[5], c[6]];
    }
  }
  return pts;
}

function split(cmds: Cmd[]): Piece[] {
  const out: Piece[] = [];
  let cur: Cmd[] = [];
  let closed = false;
  const flush = () => {
    if (cur.length) out.push({ cmds: cur, closed, pts: sample(cur) });
    cur = [];
    closed = false;
  };
  for (const c of cmds) {
    if (c[0] === 'M') flush();
    if (c[0] === 'Z') {
      closed = true;
      continue;
    }
    cur.push(c);
  }
  flush();
  return out;
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return dist(p, [a[0] + dx * t, a[1] + dy * t]);
}

/** 이 점이 다른 경로 위(또는 아주 가까이)에 있는가 → 닿아 있는 끝 */
function touchesOther(p: Pt, pieces: Piece[], self: number): boolean {
  for (let i = 0; i < pieces.length; i++) {
    if (i === self) continue;
    const pts = pieces[i].pts;
    const last = pieces[i].closed ? pts.length : pts.length - 1;
    for (let k = 0; k < last; k++) {
      if (distToSeg(p, pts[k], pts[(k + 1) % pts.length]) < 0.9) return true;
    }
  }
  return false;
}

/** 경로 끝에서의 진행 방향 (시작이면 첫 구간, 끝이면 마지막 구간) */
function forward(pts: Pt[], at: 'start' | 'end'): Pt {
  const n = pts.length;
  if (at === 'start') {
    let i = 1;
    while (i < n - 1 && dist(pts[i], pts[0]) < 3) i++;
    return unit([pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]]);
  }
  let i = n - 2;
  while (i > 0 && dist(pts[i], pts[n - 1]) < 3) i--;
  return unit([pts[n - 1][0] - pts[i][0], pts[n - 1][1] - pts[i][1]]);
}

/** 열린 획의 시작·끝에 부리를 붙입니다. 옵션이 모두 0이면 입력을 그대로 돌려줍니다. */
export function addHooks(cmds: Cmd[], o: HookOptions): Cmd[] {
  return addHooksDetailed(cmds, o).cmds;
}

/** addHooks와 같지만, 새로 생긴 부리 끝점(굵기 대비에서 삼각형으로 가늘어질 자리)도 함께 돌려줍니다. */
export function addHooksDetailed(cmds: Cmd[], o: HookOptions): { cmds: Cmd[]; tips: Pt[] } {
  const tips: Pt[] = [];
  if (o.start <= 0.01 && o.end <= 0.01) return { cmds, tips };
  const pieces = split(cmds);
  const side = o.flip ? -1 : 1;
  const out: Cmd[] = [];

  pieces.forEach((pc, idx) => {
    let body = pc.cmds;
    if (!pc.closed && pc.pts.length >= 2 && body[0]?.[0] === 'M') {
      const first = pc.pts[0];
      const last = pc.pts[pc.pts.length - 1];

      if (o.start > 0.01 && !touchesOther(first, pieces, idx)) {
        const f = forward(pc.pts, 'start');
        const L = Math.min(o.start * HOOK_MAX, pathLength(pc.pts) * HOOK_MAX_RATIO);
        // 진행 방향을 시계 방향으로 90° 돌린 쪽(가로획이면 아래쪽)으로 꺾음
        const perp: Pt = [-f[1] * side, f[0] * side];
        const back = o.style === 'beak' ? 0.7 : 0;
        const tip: Pt = [first[0] + perp[0] * L - f[0] * L * back, first[1] + perp[1] * L - f[1] * L * back];
        body = [['M', tip[0], tip[1]], ['L', first[0], first[1]], ...body.slice(1)];
        tips.push(tip);
      }

      if (o.end > 0.01 && !touchesOther(last, pieces, idx)) {
        const f = forward(pc.pts, 'end');
        const L = Math.min(o.end * HOOK_MAX, pathLength(pc.pts) * HOOK_MAX_RATIO);
        // 끝은 반대쪽(가로획이면 위쪽)으로 꺾음
        const perp: Pt = [f[1] * side, -f[0] * side];
        const fwd = o.style === 'beak' ? 0.5 : 0;
        const tip: Pt = [last[0] + perp[0] * L + f[0] * L * fwd, last[1] + perp[1] * L + f[1] * L * fwd];
        body = [...body, ['L', tip[0], tip[1]]];
        tips.push(tip);
      }
    }
    out.push(...body);
    if (pc.closed) out.push(['Z']);
  });
  return { cmds: out, tips };
}
