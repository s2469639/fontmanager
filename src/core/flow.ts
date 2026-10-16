/**
 * 한 획으로 이어 그리기
 *
 * 한 음절의 여러 획을 "펜을 떼지 않고" 이어 그린 것처럼 하나의 선으로 합칩니다.
 * 획의 끝(또는 닫힌 고리의 한 지점)끼리 방향이 자연스럽게 이어지는 쌍을 찾아,
 * 양쪽 진행 방향에 맞춘 부드러운 곡선으로 연결하고 두 경로를 한 경로로 합칩니다.
 *
 * 좌표는 설계 좌표(0..100, y 아래로)입니다.
 */
import type { Cmd } from './types';

type Pt = [number, number];

interface Piece {
  cmds: Cmd[];
  closed: boolean;
  /** 방향·교차 검사에 쓰는 촘촘한 점 목록 (닫힌 경우 끝점 중복 없음) */
  pts: Pt[];
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const unit = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

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

/** 경로 명령을 M 단위(하위 경로)로 나눕니다. */
function split(cmds: Cmd[]): Piece[] {
  const pieces: Piece[] = [];
  let cur: Cmd[] = [];
  let closed = false;
  const flush = () => {
    if (cur.length > 1 || (cur.length === 1 && cur[0][0] === 'M')) {
      const body = cur.filter((c) => c[0] !== 'Z');
      let pts = sample(body);
      if (closed && pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-6) pts = pts.slice(0, -1);
      if (body.length > 1) pieces.push({ cmds: body, closed, pts });
    }
    cur = [];
    closed = false;
  };
  for (const c of cmds) {
    if (c[0] === 'M') flush();
    if (c[0] === 'Z') closed = true;
    else cur.push(c);
  }
  flush();
  return pieces;
}

/** 열린 경로를 거꾸로 뒤집습니다. (곡선의 제어점도 순서를 바꿉니다) */
export function reverseOpen(cmds: Cmd[]): Cmd[] {
  const ends: Pt[] = [];
  const segs: Cmd[] = [];
  for (const c of cmds) {
    if (c[0] === 'M') ends.push([c[1], c[2]]);
    else if (c[0] === 'L') {
      ends.push([c[1], c[2]]);
      segs.push(c);
    } else if (c[0] === 'Q') {
      ends.push([c[3], c[4]]);
      segs.push(c);
    } else if (c[0] === 'C') {
      ends.push([c[5], c[6]]);
      segs.push(c);
    }
  }
  const last = ends[ends.length - 1];
  const out: Cmd[] = [['M', last[0], last[1]]];
  for (let k = segs.length - 1; k >= 0; k--) {
    const to = ends[k];
    const s = segs[k];
    if (s[0] === 'L') out.push(['L', to[0], to[1]]);
    else if (s[0] === 'Q') out.push(['Q', s[1], s[2], to[0], to[1]]);
    else if (s[0] === 'C') out.push(['C', s[3], s[4], s[1], s[2], to[0], to[1]]);
  }
  return out;
}

interface Port {
  piece: number;
  /** 열린 경로의 시작/끝, 또는 닫힌 고리의 한 지점 */
  kind: 'start' | 'end' | 'loop';
  p: Pt;
  /** 이 점에서 바깥(연결선이 들어오는 쪽)을 가리키는 단위 벡터 */
  dir: Pt;
  /** loop일 때: 점 목록에서의 위치 */
  idx?: number;
}

function endDir(pts: Pt[], from: 'start' | 'end'): Pt {
  const n = pts.length;
  const p = from === 'start' ? pts[0] : pts[n - 1];
  let i = from === 'start' ? 1 : n - 2;
  while (i > 0 && i < n - 1 && dist(pts[i], p) < 3) i += from === 'start' ? 1 : -1;
  const q = pts[Math.max(0, Math.min(n - 1, i))];
  return unit([p[0] - q[0], p[1] - q[1]]);
}

function portsOf(pc: Piece, index: number): Port[] {
  if (pc.pts.length < 2) return [];
  if (!pc.closed) {
    return [
      { piece: index, kind: 'start', p: pc.pts[0], dir: endDir(pc.pts, 'start') },
      { piece: index, kind: 'end', p: pc.pts[pc.pts.length - 1], dir: endDir(pc.pts, 'end') },
    ];
  }
  // 닫힌 고리: 상하좌우 끝점에서 접선 방향으로 풀어낼 수 있습니다.
  const n = pc.pts.length;
  let top = 0, bottom = 0, left = 0, right = 0;
  pc.pts.forEach((p, i) => {
    if (p[1] < pc.pts[top][1]) top = i;
    if (p[1] > pc.pts[bottom][1]) bottom = i;
    if (p[0] < pc.pts[left][0]) left = i;
    if (p[0] > pc.pts[right][0]) right = i;
  });
  const out: Port[] = [];
  for (const i of new Set([top, bottom, left, right])) {
    const t = unit([pc.pts[(i + 1) % n][0] - pc.pts[(i - 1 + n) % n][0], pc.pts[(i + 1) % n][1] - pc.pts[(i - 1 + n) % n][1]]);
    out.push({ piece: index, kind: 'loop', idx: i, p: pc.pts[i], dir: [-t[0], -t[1]] });
    out.push({ piece: index, kind: 'loop', idx: i, p: pc.pts[i], dir: t });
  }
  return out;
}

/** 닫힌 고리를 한 점에서 풀어 한 바퀴 도는 열린 경로로 만듭니다. travel: 점 순서대로(1) / 거꾸로(-1) */
function openLoop(pc: Piece, idx: number, travel: 1 | -1): Cmd[] {
  const n = pc.pts.length;
  const seq: Pt[] = [];
  for (let k = 0; k <= n; k++) seq.push(pc.pts[(((idx + travel * k) % n) + n) % n]);
  return seq.map((p, k): Cmd => [k === 0 ? 'M' : 'L', p[0], p[1]]);
}

function crossesSeg(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < -1e-6 && o(c, d, a) * o(c, d, b) < -1e-6;
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return dist(p, [a[0] + dx * t, a[1] + dy * t]);
}

/** 연결선(두 점을 잇는 선분)이 다른 획을 가로지르는지 */
function blocked(pieces: Piece[], a: Pt, b: Pt): boolean {
  for (const pc of pieces) {
    const pts = pc.pts;
    const last = pc.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i++) {
      const c = pts[i];
      const d = pts[(i + 1) % pts.length];
      if (distToSeg(a, c, d) < 1.5 || distToSeg(b, c, d) < 1.5) continue;
      if (crossesSeg(a, b, c, d)) return true;
    }
  }
  return false;
}

/** 두 연결 지점의 방향이 이만큼(코사인 합) 이상 맞아야 한 획으로 이어 봅니다. */
const MIN_FIT = 0.75;
const MIN_EACH = 0.15;

interface Cand {
  a: Port;
  b: Port;
  cost: number;
}

function candidates(pieces: Piece[], reach: number): Cand[] {
  const ports = pieces.flatMap((pc, i) => portsOf(pc, i));
  const out: Cand[] = [];
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      const a = ports[i];
      const b = ports[j];
      if (a.piece === b.piece) continue;
      const d = dist(a.p, b.p);
      if (d > reach || d < 0.3) continue;
      const u = unit([b.p[0] - a.p[0], b.p[1] - a.p[1]]);
      const fa = a.dir[0] * u[0] + a.dir[1] * u[1];
      const fb = -(b.dir[0] * u[0] + b.dir[1] * u[1]);
      // 멀리 이을수록 방향이 더 잘 맞아야 합니다. (먼 거리를 억지로 이으면 선이 구불거립니다)
      if (fa < MIN_EACH || fb < MIN_EACH || fa + fb < MIN_FIT + d * 0.014) continue;
      out.push({ a, b, cost: d * (2.2 - (fa + fb) / 2) });
    }
  }
  return out.sort((x, y) => x.cost - y.cost);
}

/** 열린 경로로 바꾸고, 지정한 포트가 끝(asEnd) 또는 시작(!asEnd)에 오도록 맞춥니다. */
function orient(pc: Piece, port: Port, asEnd: boolean): Cmd[] {
  if (port.kind === 'loop') {
    // 끝으로 쓸 때는 도착 방향(dir)으로, 시작으로 쓸 때는 -dir 방향으로 고리를 한 바퀴 돕니다.
    const n = pc.pts.length;
    const i = port.idx!;
    const fwd = unit([pc.pts[(i + 1) % n][0] - pc.pts[(i - 1 + n) % n][0], pc.pts[(i + 1) % n][1] - pc.pts[(i - 1 + n) % n][1]]);
    const along = port.dir[0] * fwd[0] + port.dir[1] * fwd[1] > 0; // dir이 점 순서 방향과 같은가
    const travel: 1 | -1 = asEnd ? (along ? 1 : -1) : along ? -1 : 1;
    return openLoop(pc, i, travel);
  }
  const wantsReverse = asEnd ? port.kind === 'start' : port.kind === 'end';
  return wantsReverse ? reverseOpen(pc.cmds) : pc.cmds;
}

/**
 * 한 음절의 경로들을 한 획으로 가능한 한 이어 붙입니다.
 * reach: 이을 수 있는 최대 거리(설계 단위). 반환: 합쳐진 경로 명령.
 */
export function flowMerge(cmds: Cmd[], reach: number): Cmd[] {
  let pieces = split(cmds);
  if (reach <= 0.5 || pieces.length < 2) return cmds;

  for (let guard = 0; guard < 16; guard++) {
    const cands = candidates(pieces, reach);
    const pick = cands.find((c) => !blocked(pieces, c.a.p, c.b.p));
    if (!pick) break;
    const { a, b } = pick;
    const A = orient(pieces[a.piece], a, true);
    const B = orient(pieces[b.piece], b, false);
    const d = dist(a.p, b.p);
    const k = Math.max(1.5, d * 0.42);
    const join: Cmd = ['C', a.p[0] + a.dir[0] * k, a.p[1] + a.dir[1] * k, b.p[0] + b.dir[0] * k, b.p[1] + b.dir[1] * k, b.p[0], b.p[1]];
    const merged = [...A, join, ...B.slice(1)];
    const mergedPts = sample(merged);
    const rest = pieces.filter((_, i) => i !== a.piece && i !== b.piece);
    pieces = [...rest, { cmds: merged, closed: false, pts: mergedPts }];
  }

  const out: Cmd[] = [];
  for (const pc of pieces) {
    out.push(...pc.cmds);
    if (pc.closed) out.push(['Z']);
  }
  return out;
}
