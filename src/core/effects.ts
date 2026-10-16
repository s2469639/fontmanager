/**
 * 형태 변형 효과 (거칠게 · 물결 · 부풀림)
 *
 * 경로를 짧은 선분들로 잘게 쪼갠 뒤 각 점을 움직입니다. 곧은 선도 휘어질 수 있도록
 * 먼저 충분히 쪼개고, 변형이 끝나면 꺾은선(L)으로 다시 내보냅니다.
 * 모든 좌표는 최종 화면 좌표(em = 1000, y는 아래로)입니다.
 */
import type { Cmd, FxParams } from './types';
import { UNIT } from './types';

type Pt = [number, number];

export interface Sub {
  pts: Pt[];
  closed: boolean;
}

export function fxActive(fx: FxParams): boolean {
  return fx.roughOn || fx.waveOn || fx.bulgeOn;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** 경로를 maxSeg 이하의 선분으로 쪼갭니다. */
export function flatten(cmds: Cmd[], maxSeg: number): Sub[] {
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let pen: Pt = [0, 0];
  const lineTo = (to: Pt) => {
    if (!cur) return;
    const n = Math.max(1, Math.ceil(dist(pen, to) / maxSeg));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      cur.pts.push([pen[0] + (to[0] - pen[0]) * t, pen[1] + (to[1] - pen[1]) * t]);
    }
    pen = to;
  };
  for (const c of cmds) {
    if (c[0] === 'M') {
      cur = { pts: [[c[1], c[2]]], closed: false };
      subs.push(cur);
      pen = [c[1], c[2]];
    } else if (!cur) {
      continue;
    } else if (c[0] === 'L') {
      lineTo([c[1], c[2]]);
    } else if (c[0] === 'Q') {
      const ctrl: Pt = [c[1], c[2]];
      const to: Pt = [c[3], c[4]];
      const n = Math.min(48, Math.max(4, Math.ceil((dist(pen, ctrl) + dist(ctrl, to)) / maxSeg)));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        cur.pts.push([u * u * pen[0] + 2 * u * t * ctrl[0] + t * t * to[0], u * u * pen[1] + 2 * u * t * ctrl[1] + t * t * to[1]]);
      }
      pen = to;
    } else if (c[0] === 'C') {
      const a: Pt = [c[1], c[2]];
      const b: Pt = [c[3], c[4]];
      const to: Pt = [c[5], c[6]];
      const n = Math.min(48, Math.max(4, Math.ceil((dist(pen, a) + dist(a, b) + dist(b, to)) / maxSeg)));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        cur.pts.push([
          u * u * u * pen[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * to[0],
          u * u * u * pen[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * to[1],
        ]);
      }
      pen = to;
    } else {
      cur.closed = true;
      const first = cur.pts[0];
      const last = cur.pts[cur.pts.length - 1];
      if (cur.pts.length > 1 && dist(first, last) < 1e-6) cur.pts.pop();
      pen = first;
    }
  }
  return subs;
}

export function subsToCmds(subs: Sub[]): Cmd[] {
  const out: Cmd[] = [];
  for (const s of subs) {
    s.pts.forEach((p, i) => out.push([i === 0 ? 'M' : 'L', p[0], p[1]]));
    if (s.closed) out.push(['Z']);
  }
  return out;
}

// ───────────────────────── 노이즈 ─────────────────────────

function hash(ix: number, iy: number, seed: number) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** -1..1 범위의 부드러운 값 노이즈 */
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** 두 단계(큰 굴곡 + 잔떨림)를 섞은 노이즈 */
function fractal(x: number, y: number, seed: number) {
  return noise(x, y, seed) * 0.7 + noise(x * 2.3, y * 2.3, seed + 17) * 0.3;
}

// ───────────────────────── 변형 ─────────────────────────

export interface FxContext {
  glyphCenter: Pt;
  glyphRadius: number;
  wordCenter: Pt;
  wordRadius: number;
}

/** 쪼개는 간격: 거친 정도가 잘게 나올수록 더 촘촘하게 */
export function segmentLength(fx: FxParams): number {
  let seg = 18;
  if (fx.roughOn) seg = Math.min(seg, Math.max(3, (fx.roughScale * UNIT) / 3));
  if (fx.waveOn) seg = Math.min(seg, Math.max(4, (fx.waveLen * UNIT) / 16));
  return seg;
}

function deformPoint(p: Pt, fx: FxParams, ctx: FxContext): Pt {
  let [x, y] = p;

  if (fx.bulgeOn) {
    const c = fx.bulgeScope === 'word' ? ctx.wordCenter : ctx.glyphCenter;
    const R = Math.max(1, fx.bulgeScope === 'word' ? ctx.wordRadius : ctx.glyphRadius);
    const dx = x - c[0];
    const dy = y - c[1];
    const r = Math.hypot(dx, dy) / R;
    if (r < 1) {
      const k = 1 + fx.bulgeAmount * (1 - r * r);
      x = c[0] + dx * k;
      y = c[1] + dy * k;
    }
  }

  if (fx.waveOn) {
    const amp = fx.waveAmp * UNIT;
    const lam = fx.waveLen * UNIT;
    const ph = (fx.wavePhase * Math.PI) / 180;
    const ox = x;
    const oy = y;
    if (fx.waveAxis === 'y' || fx.waveAxis === 'both') y = oy + amp * Math.sin((2 * Math.PI * ox) / lam + ph);
    if (fx.waveAxis === 'x' || fx.waveAxis === 'both') x = ox + amp * Math.sin((2 * Math.PI * oy) / lam + ph + (fx.waveAxis === 'both' ? 1.3 : 0));
  }

  if (fx.roughOn) {
    const amp = fx.roughAmp * UNIT;
    const s = Math.max(1, fx.roughScale * UNIT);
    const ox = x;
    const oy = y;
    x = ox + fractal(ox / s, oy / s, fx.roughSeed) * amp;
    y = oy + fractal(ox / s + 31.7, oy / s + 11.3, fx.roughSeed + 5) * amp;
  }

  return [x, y];
}

export function deform(subs: Sub[], fx: FxParams, ctx: FxContext): Sub[] {
  return subs.map((s) => ({ closed: s.closed, pts: s.pts.map((p) => deformPoint(p, fx, ctx)) }));
}

// ───────────────────────── 줄무늬 ─────────────────────────

/**
 * 줄무늬 잘라내기: 글자 위에 겹쳐 지울 띠(사각형)들을 만듭니다.
 * 반환은 화면 좌표의 사각형 꼭짓점 4개씩.
 */
export function stripeBands(
  fx: FxParams,
  box: { x: number; y: number; w: number; h: number },
): Pt[][] {
  if (!fx.stripeOn || box.w <= 0 || box.h <= 0) return [];
  const a = (fx.stripeAngle * Math.PI) / 180;
  // 띠가 뻗는 방향(u)과 쌓이는 방향(n)
  const u: Pt = [Math.cos(a), Math.sin(a)];
  const n: Pt = [-Math.sin(a), Math.cos(a)];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const extent = Math.abs(box.w * n[0]) + Math.abs(box.h * n[1]);
  const diag = Math.hypot(box.w, box.h);
  const count = Math.max(1, Math.round(fx.stripeCount));
  const pitch = extent / count;
  const cut = pitch * fx.stripeGap;
  const bands: Pt[][] = [];
  for (let i = -1; i <= count + 1; i++) {
    const t = -extent / 2 + (i + fx.stripePhase) * pitch;
    const mx = cx + n[0] * t;
    const my = cy + n[1] * t;
    const hl = diag;
    const ht = cut / 2;
    bands.push([
      [mx - u[0] * hl - n[0] * ht, my - u[1] * hl - n[1] * ht],
      [mx + u[0] * hl - n[0] * ht, my + u[1] * hl - n[1] * ht],
      [mx + u[0] * hl + n[0] * ht, my + u[1] * hl + n[1] * ht],
      [mx - u[0] * hl + n[0] * ht, my - u[1] * hl + n[1] * ht],
    ]);
  }
  return bands;
}
