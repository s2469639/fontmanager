/**
 * 자소 조립 엔진 (선형 글자 프로토타입)
 *
 * 글꼴 윤곽선 대신, 자음·모음을 "굵기 없는 선(뼈대)"으로 직접 정의하고
 * 모음의 종류와 받침 유무에 따라 정해 둔 칸(rect)에 배치해 한 음절을 조립합니다.
 * 결과는 선 경로이며, 굵기·끝모양은 렌더링 단계에서 입힙니다.
 *
 * 한계: 뼈대는 이 프로젝트에서 직접 단순하게 정의한 것이라 디자이너가 다듬은 글자체가 아닙니다.
 * 규칙으로 11,172자를 모두 조립하지만, 받침·겹모음·쌍자음 일부 조합은 어색할 수 있습니다.
 */
import type { Cmd, GlyphOverride, GlyphShape, JamoParams, PartAdjust, SkelNode, SkelStroke } from './types';
import { flowMerge } from './flow';
import { addHooksDetailed } from './hook';
import { variableStroke } from './vstroke';

type Pt = [number, number];
type Rect = [number, number, number, number]; // x0, y0, x1, y1 (설계 좌표 0..100, y는 아래로)

type Stroke =
  | { t: 'poly'; pts: Pt[]; closed?: boolean }
  | { t: 'ring'; c: Pt; r: number }
  | { t: 'bez'; ops: BezOp[] }
  | { t: 'path'; nodes: SkelNode[]; closed?: boolean };

// ───────────────────────── 자모 표 ─────────────────────────

export const INITIALS = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
export const MEDIALS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
export const FINALS = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

/** 겹자음(쌍자음·겹받침)을 두 자음으로 나눕니다. */
const PAIRS: Record<string, [string, string]> = {
  ㄲ: ['ㄱ', 'ㄱ'], ㄸ: ['ㄷ', 'ㄷ'], ㅃ: ['ㅂ', 'ㅂ'], ㅆ: ['ㅅ', 'ㅅ'], ㅉ: ['ㅈ', 'ㅈ'],
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'],
  ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'],
};

export interface Syllable {
  initial: string;
  medial: string;
  final: string;
}

export function decompose(ch: string): Syllable | null {
  const cp = ch.codePointAt(0)!;
  if (cp < 0xac00 || cp > 0xd7a3) return null;
  const n = cp - 0xac00;
  return {
    initial: INITIALS[Math.floor(n / 588)],
    medial: MEDIALS[Math.floor((n % 588) / 28)],
    final: FINALS[n % 28],
  };
}

// ───────────────────────── 뼈대 정의 (0..1 상자 안) ─────────────────────────

type BezOp = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number] | ['Z'];

const line = (...pts: Pt[]): Stroke => ({ t: 'poly', pts });
const box = (...pts: Pt[]): Stroke => ({ t: 'poly', pts, closed: true });
const ring = (cx: number, cy: number, r: number): Stroke => ({ t: 'ring', c: [cx, cy], r });
const bez = (...ops: BezOp[]): Stroke => ({ t: 'bez', ops });

export interface Variant {
  name: string;
  strokes: Stroke[];
}
const v = (name: string, ...strokes: Stroke[]): Variant => ({ name, strokes });

/**
 * 자모별 뼈대 모양 목록. 0번이 기본 모양이고, 그 뒤가 선택할 수 있는 변형입니다.
 * 좌표는 0..1 상자 안이며 y는 아래로 증가합니다.
 */
const CONS_VARIANTS: Record<string, Variant[]> = {
  ㄱ: [
    v('직각', line([0, 0], [1, 0], [1, 1])),
    v('사선', line([0, 0], [1, 0], [0.78, 1])),
    v('곡선', bez(['M', 0, 0], ['Q', 1, 0, 1, 1])),
  ],
  ㄴ: [
    v('직각', line([0, 0], [0, 1], [1, 1])),
    v('사선', line([0, 0], [0.22, 1], [1, 1])),
    v('곡선', bez(['M', 0, 0], ['Q', 0, 1, 1, 1])),
  ],
  ㄷ: [
    v('직각', line([1, 0], [0, 0], [0, 1], [1, 1])),
    v('둥근', bez(['M', 1, 0], ['L', 0.4, 0], ['Q', 0, 0, 0, 0.5], ['Q', 0, 1, 0.4, 1], ['L', 1, 1])),
  ],
  ㄹ: [
    v('직각', line([0, 0], [1, 0], [1, 0.5], [0, 0.5], [0, 1], [1, 1])),
    v('흘림', line([0, 0], [1, 0], [0.88, 0.5], [0.12, 0.5], [0, 1], [1, 1])),
  ],
  ㅁ: [
    v('사각', box([0, 0], [1, 0], [1, 1], [0, 1])),
    v('둥근', bez(['M', 0.28, 0], ['L', 0.72, 0], ['Q', 1, 0, 1, 0.28], ['L', 1, 0.72], ['Q', 1, 1, 0.72, 1], ['L', 0.28, 1], ['Q', 0, 1, 0, 0.72], ['L', 0, 0.28], ['Q', 0, 0, 0.28, 0], ['Z'])),
    v('마름모', box([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5])),
    v('열린', line([0, 0.3], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0.6])),
  ],
  ㅂ: [
    v('기본', line([0, 0], [0, 1], [1, 1], [1, 0]), line([0, 0.5], [1, 0.5])),
    v('닫힌', box([0, 0], [1, 0], [1, 1], [0, 1]), line([0, 0.5], [1, 0.5])),
  ],
  ㅅ: [
    v('기본', line([0, 1], [0.5, 0], [1, 1])),
    v('갈라진', line([0.5, 0], [0, 1]), line([0.4, 0.3], [1, 1])),
    v('곡선', bez(['M', 0, 1], ['Q', 0.5, -1, 1, 1])),
  ],
  ㅇ: [v('기본', ring(0.5, 0.5, 0.5))],
  ㅈ: [
    v('기본', line([0, 0.12], [1, 0.12]), line([0, 1], [0.5, 0.12], [1, 1])),
    v('갈라진', line([0, 0.12], [1, 0.12]), line([0.5, 0.12], [0, 1]), line([0.42, 0.45], [1, 1])),
    v('곡선', line([0, 0.12], [1, 0.12]), bez(['M', 0, 1], ['Q', 0.5, -0.76, 1, 1])),
  ],
  ㅊ: [
    v('기본', line([0.3, 0], [0.7, 0]), line([0, 0.3], [1, 0.3]), line([0, 1], [0.5, 0.3], [1, 1])),
    v('갈라진', line([0.3, 0], [0.7, 0]), line([0, 0.3], [1, 0.3]), line([0.5, 0.3], [0, 1]), line([0.42, 0.58], [1, 1])),
  ],
  ㅋ: [
    v('기본', line([0, 0], [1, 0], [1, 1]), line([0, 0.5], [1, 0.5])),
    v('짧은 줄', line([0, 0], [1, 0], [1, 1]), line([0.38, 0.5], [1, 0.5])),
  ],
  ㅌ: [
    v('기본', line([1, 0], [0, 0], [0, 1], [1, 1]), line([0, 0.5], [1, 0.5])),
    v('짧은 줄', line([1, 0], [0, 0], [0, 1], [1, 1]), line([0, 0.5], [0.66, 0.5])),
  ],
  ㅍ: [
    v('기본', line([0, 0], [1, 0]), line([0, 1], [1, 1]), line([0.28, 0], [0.28, 1]), line([0.72, 0], [0.72, 1])),
    v('안쪽 줄', line([0, 0], [1, 0]), line([0, 1], [1, 1]), line([0.25, 0.1], [0.25, 0.9]), line([0.75, 0.1], [0.75, 0.9])),
  ],
  ㅎ: [
    v('기본', line([0.3, 0], [0.7, 0]), line([0, 0.3], [1, 0.3]), ring(0.5, 0.76, 0.24)),
    v('큰 고리', line([0.3, 0], [0.7, 0]), line([0, 0.26], [1, 0.26]), ring(0.5, 0.68, 0.32)),
  ],
};

/** 단일 모음의 뼈대 모양 목록. 겹모음은 아래 COMPOUND로 조합합니다. */
const VOWEL_VARIANTS: Record<string, Variant[]> = {
  ㅏ: [
    v('기본', line([0.4, 0], [0.4, 1]), line([0.4, 0.5], [1, 0.5])),
    v('가지 위', line([0.4, 0], [0.4, 1]), line([0.4, 0.35], [1, 0.35])),
    v('사선 가지', line([0.4, 0], [0.4, 1]), line([0.4, 0.62], [1, 0.34])),
  ],
  ㅐ: [v('기본', line([0.25, 0], [0.25, 1]), line([0.25, 0.5], [0.58, 0.5]), line([0.78, 0], [0.78, 1]))],
  ㅑ: [v('기본', line([0.4, 0], [0.4, 1]), line([0.4, 0.3], [1, 0.3]), line([0.4, 0.7], [1, 0.7]))],
  ㅒ: [v('기본', line([0.25, 0], [0.25, 1]), line([0.25, 0.3], [0.58, 0.3]), line([0.25, 0.7], [0.58, 0.7]), line([0.78, 0], [0.78, 1]))],
  ㅓ: [
    v('기본', line([0.6, 0], [0.6, 1]), line([0, 0.5], [0.6, 0.5])),
    v('가지 위', line([0.6, 0], [0.6, 1]), line([0, 0.35], [0.6, 0.35])),
    v('사선 가지', line([0.6, 0], [0.6, 1]), line([0, 0.34], [0.6, 0.62])),
  ],
  ㅔ: [v('기본', line([0.42, 0], [0.42, 1]), line([0, 0.5], [0.42, 0.5]), line([0.78, 0], [0.78, 1]))],
  ㅕ: [v('기본', line([0.6, 0], [0.6, 1]), line([0, 0.3], [0.6, 0.3]), line([0, 0.7], [0.6, 0.7]))],
  ㅖ: [v('기본', line([0.42, 0], [0.42, 1]), line([0, 0.3], [0.42, 0.3]), line([0, 0.7], [0.42, 0.7]), line([0.78, 0], [0.78, 1]))],
  ㅣ: [
    v('기본', line([0.5, 0], [0.5, 1])),
    v('곡선', bez(['M', 0.62, 0], ['Q', 0.28, 0.5, 0.62, 1])),
    v('사선', line([0.64, 0], [0.36, 1])),
  ],
  ㅗ: [
    v('기본', line([0, 0.65], [1, 0.65]), line([0.5, 0.65], [0.5, 0])),
    v('짧은 가지', line([0, 0.65], [1, 0.65]), line([0.5, 0.65], [0.5, 0.25])),
  ],
  ㅛ: [v('기본', line([0, 0.65], [1, 0.65]), line([0.3, 0.65], [0.3, 0]), line([0.7, 0.65], [0.7, 0]))],
  ㅜ: [
    v('기본', line([0, 0.35], [1, 0.35]), line([0.5, 0.35], [0.5, 1])),
    v('짧은 가지', line([0, 0.35], [1, 0.35]), line([0.5, 0.35], [0.5, 0.75])),
  ],
  ㅠ: [v('기본', line([0, 0.35], [1, 0.35]), line([0.3, 0.35], [0.3, 1]), line([0.7, 0.35], [0.7, 1]))],
  ㅡ: [
    v('기본', line([0, 0.5], [1, 0.5])),
    v('물결', bez(['M', 0, 0.5], ['Q', 0.25, 0.15, 0.5, 0.5], ['Q', 0.75, 0.85, 1, 0.5])),
  ],
};

const CONSONANTS: Record<string, Stroke[]> = Object.fromEntries(
  Object.entries(CONS_VARIANTS).map(([k, list]) => [k, list[0].strokes]),
);
const VOWELS: Record<string, Stroke[]> = Object.fromEntries(
  Object.entries(VOWEL_VARIANTS).map(([k, list]) => [k, list[0].strokes]),
);

/**
 * 한 부분을 그릴 때 어떤 뼈대를 쓸지 정하는 규칙.
 * 우선순위: 이 글자에서만 직접 그린 뼈대 > 이 글자에서 직접 고른 모양 > 전체에 직접 그린 뼈대 > 자모별 모양 > 기본 모양
 */
interface Pick {
  get: (ch: string) => number;
  /** 이 글자에서 모양을 직접 골랐는지 (전체에 직접 그린 뼈대보다 우선) */
  forced: boolean;
  /** 전체(모든 글자)에 적용되는, 직접 그린 뼈대 */
  custom?: Record<string, SkelStroke[]>;
  /** 이 글자에서만 적용되는, 직접 그린 뼈대 */
  own?: Record<string, SkelStroke[]>;
}

const pickOf = (
  fixed: number | undefined,
  map: Record<string, number> | undefined,
  custom?: Record<string, SkelStroke[]>,
  own?: Record<string, SkelStroke[]>,
): Pick => ({ get: (ch) => fixed ?? map?.[ch] ?? 0, forced: fixed !== undefined, custom, own });

function variantStrokes(table: Record<string, Variant[]>, ch: string, pick: Pick): Stroke[] | undefined {
  const list = table[ch];
  if (!list) return undefined;
  const mine = pick.own?.[ch];
  if (mine && mine.length) return mine;
  const shared = pick.custom?.[ch];
  if (shared && shared.length && !pick.forced) return shared;
  return list[Math.max(0, Math.min(pick.get(ch), list.length - 1))].strokes;
}

/** UI용: 이 자모에 고를 수 있는 뼈대 모양의 이름 목록 (모양이 하나뿐이면 빈 배열) */
export function variantNames(ch: string): string[] {
  const list = CONS_VARIANTS[ch] ?? VOWEL_VARIANTS[ch];
  return list && list.length > 1 ? list.map((x) => x.name) : [];
}

/** 텍스트에 쓰인 자모 중 모양을 고를 수 있는 것들 (등장 순서, 중복 없음) */
export function selectableJamoIn(text: string): string[] {
  const out: string[] = [];
  const add = (c: string) => {
    if (variantNames(c).length && !out.includes(c)) out.push(c);
  };
  const addConsonant = (c: string) => (PAIRS[c] ? PAIRS[c].forEach(add) : add(c));
  for (const ch of Array.from(text)) {
    const syl = decompose(ch);
    if (syl) {
      addConsonant(syl.initial);
      const comp = COMPOUND[syl.medial];
      if (comp) {
        add(comp[0]);
        add(comp[1]);
      } else add(syl.medial);
      if (syl.final) addConsonant(syl.final);
    } else if (ch in CONS_VARIANTS || ch in PAIRS) addConsonant(ch);
    else if (ch in VOWEL_VARIANTS) add(ch);
  }
  return out;
}

/** 겹모음 = (가로 모음, 세로 모음). 가로 모음은 왼쪽 아래, 세로 모음은 오른쪽에 놓입니다. */
const COMPOUND: Record<string, [string, string, number]> = {
  ㅘ: ['ㅗ', 'ㅏ', 0.5],
  ㅙ: ['ㅗ', 'ㅐ', 0.42],
  ㅚ: ['ㅗ', 'ㅣ', 0.72],
  ㅝ: ['ㅜ', 'ㅓ', 0.42],
  ㅞ: ['ㅜ', 'ㅔ', 0.36],
  ㅟ: ['ㅜ', 'ㅣ', 0.72],
  ㅢ: ['ㅡ', 'ㅣ', 0.78],
};

type VowelKind = 'vertical' | 'horizontal' | 'mixed';

function vowelKind(v: string): VowelKind {
  if (v in COMPOUND) return 'mixed';
  if ('ㅗㅛㅜㅠㅡ'.includes(v)) return 'horizontal';
  return 'vertical';
}

// ───────────────────────── 칸 배치 규칙 ─────────────────────────

interface Layout {
  L: Rect;
  V: Rect;
  T?: Rect;
}

/** 모음 종류 × 받침 유무에 따라 초성·중성·종성이 놓일 칸을 정합니다. (설계 좌표 0..100) */
function layoutFor(kind: VowelKind, hasFinal: boolean, cluster: boolean): Layout {
  // 부분 사이 간격은 최소 약 8 이상이 되게 잡았습니다. (선 굵기의 1.5배 이상이라 붙어 보이지 않음)
  if (cluster) {
    // 겹받침은 두 자음이 들어가야 해서 받침 칸을 더 넓고 높게 잡고, 위쪽을 조금 줄입니다.
    if (kind === 'vertical') return { L: [0, 2, 46, 40], V: [58, 0, 100, 50], T: [4, 60, 96, 100] };
    if (kind === 'horizontal') return { L: [18, 0, 82, 18], V: [0, 29, 100, 50], T: [4, 60, 96, 100] };
    return { L: [0, 0, 40, 18], V: [0, 0, 100, 52], T: [4, 62, 96, 100] };
  }
  if (kind === 'vertical') {
    return hasFinal
      ? { L: [0, 6, 46, 48], V: [58, 0, 100, 60], T: [8, 72, 92, 100] }
      : { L: [0, 14, 48, 86], V: [58, 0, 100, 100] };
  }
  if (kind === 'horizontal') {
    return hasFinal
      ? { L: [18, 0, 82, 30], V: [0, 38, 100, 62], T: [8, 73, 92, 100] }
      : { L: [14, 0, 86, 50], V: [0, 62, 100, 100] };
  }
  // 겹모음: 초성은 왼쪽 위에 조금 작게, 모음의 가로 가지와 8 이상 떨어지게
  return hasFinal
    ? { L: [0, 0, 40, 24], V: [0, 0, 100, 64], T: [8, 76, 92, 100] }
    : { L: [0, 0, 40, 42], V: [0, 0, 100, 100] };
}

function scaleRect(r: Rect, k: number): Rect {
  const cx = (r[0] + r[2]) / 2;
  const cy = (r[1] + r[3]) / 2;
  const hw = ((r[2] - r[0]) / 2) * k;
  const hh = ((r[3] - r[1]) / 2) * k;
  return [cx - hw, cy - hh, cx + hw, cy + hh];
}

function shiftRect(r: Rect, dx: number, dy: number): Rect {
  return [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
}

// ───────────────────────── 뼈대 → 칸에 배치한 스트로크 ─────────────────────────

interface Placed {
  strokes: PlacedStroke[];
  /** 초성/모음/받침 순서로 나뉜 스트로크 (획 연결 계산용) */
  parts: PlacedStroke[][];
}
type PlacedStroke =
  | { t: 'poly'; pts: Pt[]; closed: boolean }
  | { t: 'path'; nodes: SkelNode[]; closed: boolean }
  | { t: 'bez'; ops: BezOp[] }
  | { t: 'ring'; c: Pt; rx: number; ry: number; rot: number };

function place(strokes: Stroke[], rect: Rect, out: PlacedStroke[], oAspect: boolean) {
  const [x0, y0, x1, y1] = rect;
  const w = x1 - x0;
  const h = y1 - y0;
  for (const s of strokes) {
    if (s.t === 'poly') {
      out.push({
        t: 'poly',
        closed: !!s.closed,
        pts: s.pts.map(([nx, ny]) => [x0 + nx * w, y0 + ny * h] as Pt),
      });
    } else if (s.t === 'path') {
      out.push({
        t: 'path',
        closed: !!s.closed,
        nodes: s.nodes.map((n) => ({ x: x0 + n.x * w, y: y0 + n.y * h, ...(n.s ? { s: true } : {}) })),
      });
    } else if (s.t === 'bez') {
      const mx = (nx: number) => x0 + nx * w;
      const my = (ny: number) => y0 + ny * h;
      out.push({
        t: 'bez',
        ops: s.ops.map((o): BezOp =>
          o[0] === 'Z' ? o : o[0] === 'Q' ? ['Q', mx(o[1]), my(o[2]), mx(o[3]), my(o[4])] : [o[0], mx(o[1]), my(o[2])],
        ),
      });
    } else {
      const m = Math.min(w, h);
      const r = s.r * m;
      out.push({
        t: 'ring',
        c: [x0 + s.c[0] * w, y0 + s.c[1] * h],
        rx: oAspect ? r : s.r * w,
        ry: oAspect ? r : s.r * h,
        rot: 0,
      });
    }
  }
}

function placeConsonant(name: string, rect: Rect, out: PlacedStroke[], pick: Pick) {
  const pair = PAIRS[name];
  if (pair) {
    const w = rect[2] - rect[0];
    // ㅅ·ㅈ 계열은 붙여 놓으면 'M'자처럼 보여서 두 글자 사이를 더 벌립니다.
    const wide = 'ㅅㅈㅊ'.includes(pair[0]);
    const gap = w * (wide ? 0.2 : 0.1);
    const half = (w - gap) / 2;
    // 좁은 칸에 두 개가 들어가면 가늘고 길어지므로, ㅆ·ㅉ 계열은 높이도 조금 줄여 비율을 맞춥니다.
    const cy = (rect[1] + rect[3]) / 2;
    const hh = ((rect[3] - rect[1]) * (wide ? 0.84 : 1)) / 2;
    placeConsonant(pair[0], [rect[0], cy - hh, rect[0] + half, cy + hh], out, pick);
    placeConsonant(pair[1], [rect[2] - half, cy - hh, rect[2], cy + hh], out, pick);
    return;
  }
  const strokes = variantStrokes(CONS_VARIANTS, name, pick);
  if (strokes) place(strokes, rect, out, true);
}

function placeVowel(name: string, rect: Rect, out: PlacedStroke[], pick: Pick) {
  const comp = COMPOUND[name];
  if (comp) {
    const [horiz, vert, vx] = comp;
    const [x0, y0, x1, y1] = rect;
    const w = x1 - x0;
    const h = y1 - y0;
    // 가로 모음은 아래쪽, 세로 모음은 오른쪽 전체 높이
    place(variantStrokes(VOWEL_VARIANTS, horiz, pick)!, [x0, y0 + h * 0.56, x0 + w * (vx + 0.08), y1], out, false);
    place(variantStrokes(VOWEL_VARIANTS, vert, pick)!, [x0 + w * vx, y0, x1, y1], out, false);
    return;
  }
  const strokes = variantStrokes(VOWEL_VARIANTS, name, pick);
  if (strokes) place(strokes, rect, out, false);
}

/** 음절 하나를 설계 좌표(0..100)의 스트로크 목록으로 조립합니다. */
const CLUSTERS = new Set(['ㄳ', 'ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ']);

/** 한 부분(초성/모음/받침)의 크기·위치·회전을 칸의 중심 기준으로 바꿉니다. */
function adjustStrokes(strokes: PlacedStroke[], rect: Rect, adj?: Partial<PartAdjust>): PlacedStroke[] {
  if (!adj) return strokes;
  const { scale = 1, dx = 0, dy = 0, rot = 0 } = adj;
  if (scale === 1 && dx === 0 && dy === 0 && rot === 0) return strokes;
  const cx = (rect[0] + rect[2]) / 2;
  const cy = (rect[1] + rect[3]) / 2;
  const a = (rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const tp = ([x, y]: Pt): Pt => {
    const px = (x - cx) * scale;
    const py = (y - cy) * scale;
    return [cx + px * cos - py * sin + dx, cy + px * sin + py * cos + dy];
  };
  return strokes.map((s): PlacedStroke => {
    if (s.t === 'poly') return { ...s, pts: s.pts.map(tp) };
    if (s.t === 'path') {
      return { ...s, nodes: s.nodes.map((n) => { const [x, y] = tp([n.x, n.y]); return { ...n, x, y }; }) };
    }
    if (s.t === 'bez') {
      return {
        t: 'bez',
        ops: s.ops.map((o): BezOp => {
          if (o[0] === 'Z') return o;
          if (o[0] === 'Q') {
            const a = tp([o[1], o[2]]);
            const b = tp([o[3], o[4]]);
            return ['Q', a[0], a[1], b[0], b[1]];
          }
          const a = tp([o[1], o[2]]);
          return [o[0], a[0], a[1]];
        }),
      };
    }
    return { ...s, c: tp(s.c), rx: s.rx * scale, ry: s.ry * scale, rot: s.rot + rot };
  });
}

/** 흔들림용 작은 난수(결정적). 같은 씨앗·글자·자리면 항상 같은 값 */
function wobbleRng(...keys: number[]) {
  let h = 2166136261;
  for (const k of keys) h = Math.imul(h ^ (k | 0), 16777619) >>> 0;
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5; // -0.5..0.5
  };
}

/**
 * 손글씨처럼 흔듭니다. 한 부분 전체에 기울기·크기·위치 변화를 주고(adjustStrokes 재사용),
 * 각 점도 조금씩 흔듭니다. amount 1이면 설계 좌표(0..100)에서 점이 최대 약 ±1.8, 기울기 ±5° 정도입니다.
 */
function wobbleStrokes(strokes: PlacedStroke[], rect: Rect, amount: number, rnd: () => number): PlacedStroke[] {
  if (amount <= 0.001) return strokes;
  const rigid = adjustStrokes(strokes, rect, {
    rot: rnd() * 10 * amount,
    scale: 1 + rnd() * 0.12 * amount,
    dx: rnd() * 3.5 * amount,
    dy: rnd() * 3.5 * amount,
  });
  const j = (): number => rnd() * 3.6 * amount;
  const jp = ([x, y]: Pt): Pt => [x + j(), y + j()];
  return rigid.map((s): PlacedStroke => {
    if (s.t === 'poly') return { ...s, pts: s.pts.map(jp) };
    if (s.t === 'path') return { ...s, nodes: s.nodes.map((n) => { const [x, y] = jp([n.x, n.y]); return { ...n, x, y }; }) };
    if (s.t === 'bez') {
      return {
        t: 'bez',
        ops: s.ops.map((o): BezOp => {
          if (o[0] === 'Z') return o;
          if (o[0] === 'Q') {
            const a = jp([o[1], o[2]]);
            const b = jp([o[3], o[4]]);
            return ['Q', a[0], a[1], b[0], b[1]];
          }
          const a = jp([o[1], o[2]]);
          return [o[0], a[0], a[1]];
        }),
      };
    }
    return { ...s, c: jp(s.c), rx: s.rx * (1 + rnd() * 0.16 * amount), ry: s.ry * (1 + rnd() * 0.16 * amount) };
  });
}

export function assemble(
  syl: Syllable,
  jp: JamoParams,
  ov?: GlyphOverride,
  variants?: Record<string, number>,
  custom?: Record<string, SkelStroke[]>,
  index = 0,
): Placed {
  const kind = vowelKind(syl.medial);
  const lay = layoutFor(kind, syl.final !== '', CLUSTERS.has(syl.final));
  let L = scaleRect(lay.L, jp.consonantScale);
  let V = scaleRect(lay.V, jp.vowelScale);
  const g = jp.gap;
  if (kind === 'vertical') {
    L = shiftRect(L, -g / 2, 0);
    V = shiftRect(V, g / 2, 0);
  } else {
    L = shiftRect(L, kind === 'mixed' ? -g / 2 : 0, -g / 2);
    if (kind === 'horizontal') V = shiftRect(V, 0, g / 2);
  }
  const strokes: PlacedStroke[] = [];
  const parts: PlacedStroke[][] = [];
  const part = (fn: (r: Rect, out: PlacedStroke[]) => void, rect: Rect, adj?: Partial<PartAdjust>) => {
    const tmp: PlacedStroke[] = [];
    fn(rect, tmp);
    const adjusted0 = adjustStrokes(tmp, rect, adj);
    const adjusted = wobbleStrokes(adjusted0, rect, jp.wobble, wobbleRng(jp.wobbleSeed, index, parts.length));
    strokes.push(...adjusted);
    parts.push(adjusted);
  };
  part((r, o) => placeConsonant(syl.initial, r, o, pickOf(ov?.Lv, variants, custom, ov?.skeletons)), L, ov?.L);
  part((r, o) => placeVowel(syl.medial, r, o, pickOf(ov?.Vv, variants, custom, ov?.skeletons)), V, ov?.V);
  if (syl.final && lay.T) part((r, o) => placeConsonant(syl.final, r, o, pickOf(ov?.Tv, variants, custom, ov?.skeletons)), lay.T, ov?.T);
  return { strokes, parts };
}

/** UI에서 쓰는 정보: 한 글자가 어떤 부분으로 이루어져 있고, 고리(ㅇ·ㅎ)가 있는지 */
export function partsOf(ch: string): { L?: string; V?: string; T?: string; hasRing: boolean } | null {
  const syl = decompose(ch);
  if (!syl) {
    if (ch in CONSONANTS || ch in PAIRS) return { L: ch, hasRing: ch === 'ㅇ' || ch === 'ㅎ' };
    if (ch in VOWELS || ch in COMPOUND) return { V: ch, hasRing: false };
    return null;
  }
  const ring = (c: string) => c === 'ㅇ' || c === 'ㅎ';
  const hasRing = ring(syl.initial) || (syl.final !== '' && ring(syl.final)) || (PAIRS[syl.final]?.some(ring) ?? false);
  return { L: syl.initial, V: syl.medial, T: syl.final || undefined, hasRing };
}

/** 한글 낱자(ㄱ, ㅏ 등)만 입력했을 때의 조립 */
function assembleLoose(
  ch: string,
  jp: JamoParams,
  variants?: Record<string, number>,
  custom?: Record<string, SkelStroke[]>,
): Placed | null {
  const strokes: PlacedStroke[] = [];
  const pick = pickOf(undefined, variants, custom);
  if (ch in CONSONANTS || ch in PAIRS) {
    placeConsonant(ch, scaleRect([20, 20, 80, 80], jp.consonantScale), strokes, pick);
    return { strokes, parts: [strokes] };
  }
  if (ch in VOWELS || ch in COMPOUND) {
    const kind = vowelKind(ch);
    const rect: Rect = kind === 'horizontal' ? [0, 30, 100, 70] : kind === 'vertical' ? [30, 0, 70, 100] : [0, 0, 100, 100];
    placeVowel(ch, scaleRect(rect, jp.vowelScale), strokes, pick);
    return { strokes, parts: [strokes] };
  }
  return null;
}

// ───────────────────────── 스트로크 → 경로 명령 ─────────────────────────

const DESIGN = 100;
/** 한 칸의 크기(em=1000 기준). 한글 음절이 거의 정사각형이라 가로세로를 같게 둡니다. */
export const CELL = 860;
const TOP = 800;

function dist(a: Pt, b: Pt) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** 꺾이는 점을 곡선으로 둥글립니다. r은 설계 좌표 단위의 최대 반지름 */
function roundedPoly(pts: Pt[], closed: boolean, r: number): Cmd[] {
  const clean = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 1e-6);
  const n = clean.length;
  const cmds: Cmd[] = [];
  if (n < 2) return cmds;
  if (r <= 0.01) {
    clean.forEach((p, i) => cmds.push([i === 0 ? 'M' : 'L', p[0], p[1]]));
    if (closed) cmds.push(['Z']);
    return cmds;
  }
  const corner = (i: number) => {
    const p = clean[i];
    const prev = clean[(i - 1 + n) % n];
    const next = clean[(i + 1) % n];
    const rr = Math.min(r, dist(p, prev) / 2, dist(p, next) / 2);
    const a: Pt = [p[0] + ((prev[0] - p[0]) / dist(p, prev)) * rr, p[1] + ((prev[1] - p[1]) / dist(p, prev)) * rr];
    const b: Pt = [p[0] + ((next[0] - p[0]) / dist(p, next)) * rr, p[1] + ((next[1] - p[1]) / dist(p, next)) * rr];
    return { a, p, b };
  };
  if (closed) {
    for (let i = 0; i < n; i++) {
      const { a, p, b } = corner(i);
      cmds.push([i === 0 ? 'M' : 'L', a[0], a[1]]);
      cmds.push(['Q', p[0], p[1], b[0], b[1]]);
    }
    cmds.push(['Z']);
    return cmds;
  }
  cmds.push(['M', clean[0][0], clean[0][1]]);
  for (let i = 1; i < n - 1; i++) {
    const { a, p, b } = corner(i);
    cmds.push(['L', a[0], a[1]]);
    cmds.push(['Q', p[0], p[1], b[0], b[1]]);
  }
  cmds.push(['L', clean[n - 1][0], clean[n - 1][1]]);
  return cmds;
}

/** 타원 호를 3차 베지어로 만듭니다. 각도는 라디안, y는 아래로 증가(시계 방향) */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, first: boolean): Cmd[] {
  const cmds: Cmd[] = [];
  const segs = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9));
  const da = (a1 - a0) / segs;
  const k = (4 / 3) * Math.tan(da / 4);
  const pt = (a: number): Pt => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  const d = (a: number): Pt => [-rx * Math.sin(a), ry * Math.cos(a)];
  let a = a0;
  if (first) {
    const s = pt(a);
    cmds.push(['M', s[0], s[1]]);
  }
  for (let i = 0; i < segs; i++) {
    const p0 = pt(a);
    const p1 = pt(a + da);
    const d0 = d(a);
    const d1 = d(a + da);
    cmds.push(['C', p0[0] + k * d0[0], p0[1] + k * d0[1], p1[0] - k * d1[0], p1[1] - k * d1[1], p1[0], p1[1]]);
    a += da;
  }
  return cmds;
}

function rotateAround(p: Pt, c: Pt, deg: number): Pt {
  if (!deg) return p;
  const a = (deg * Math.PI) / 180;
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}

function ringCmds(c: Pt, rx: number, ry: number, rot: number, jp: JamoParams, radius: number): Cmd[] {
  const open = jp.circleGap > 0.04;
  if (jp.oShape === 'circle') {
    if (!open) return [...arc(c[0], c[1], rx, ry, -Math.PI / 2, (3 * Math.PI) / 2, true), ['Z']];
    // 열린 원: 오른쪽 위(-45°)를 중심으로 circleGap 비율만큼 틈을 둡니다.
    const gapAngle = jp.circleGap * Math.PI * 2;
    const center = -Math.PI / 4 + (rot * Math.PI) / 180;
    return arc(c[0], c[1], rx, ry, center + gapAngle / 2, center + Math.PI * 2 - gapAngle / 2, true);
  }
  const base: Pt[] =
    jp.oShape === 'square'
      ? [[c[0] - rx, c[1] - ry], [c[0] + rx, c[1] - ry], [c[0] + rx, c[1] + ry], [c[0] - rx, c[1] + ry]]
      : [[c[0], c[1] - ry], [c[0] + rx, c[1]], [c[0], c[1] + ry], [c[0] - rx, c[1]]];
  const pts = base.map((p) => rotateAround(p, c, rot));
  if (!open) return roundedPoly(pts, true, radius);
  // 열린 사각/마름모: 시작점에서 한 바퀴 돌되 닫지 않고, 틈 크기만큼 마지막 변을 줄입니다.
  const ring = [...pts, pts[0]];
  const t = 1 - Math.min(0.9, jp.circleGap * 1.4);
  const last = ring[ring.length - 1];
  const prev = ring[ring.length - 2];
  ring[ring.length - 1] = [prev[0] + (last[0] - prev[0]) * t, prev[1] + (last[1] - prev[1]) * t];
  return roundedPoly(ring, false, radius);
}

/** 설계 좌표(0..100, y 아래로)를 글꼴 좌표(em=1000, y 위로)로 옮깁니다. */
function toGlyphSpace(cmds: Cmd[], dyUp: number): Cmd[] {
  const k = CELL / DESIGN;
  const fx = (x: number) => x * k;
  const fy = (y: number) => TOP - y * k + dyUp;
  return cmds.map((c): Cmd => {
    switch (c[0]) {
      case 'M':
      case 'L':
        return [c[0], fx(c[1]), fy(c[2])];
      case 'Q':
        return ['Q', fx(c[1]), fy(c[2]), fx(c[3]), fy(c[4])];
      case 'C':
        return ['C', fx(c[1]), fy(c[2]), fx(c[3]), fy(c[4]), fx(c[5]), fy(c[6])];
      default:
        return c;
    }
  });
}

export function isJamoDrawable(ch: string): boolean {
  return decompose(ch) !== null || ch in CONSONANTS || ch in VOWELS || ch in COMPOUND || ch in PAIRS;
}

/**
 * 글자 하나를 선 경로로 조립합니다. index는 글자 순서(bounce 효과용).
 * 한글이 아닌 글자는 null.
 */
// ───────────────────────── 획 연결 ─────────────────────────

/** 획 연결이 닿을 수 있는 최대 거리(설계 단위) = link × 이 값 */
const LINK_MAX_REACH = 30;
/** 한 획으로 이어 그릴 때 닿을 수 있는 최대 거리 = link × 이 값 */
const FLOW_MAX_REACH = 42;

interface Anchor {
  p: Pt;
  /** 이 점에서 바깥(획이 뻗어 나가는 쪽)을 가리키는 단위 벡터 */
  dir: Pt;
}
type Seg = [Pt, Pt];

interface Geo {
  segs: Seg[];
  /** 연결을 시작할 수 있는 점: 열린 획의 양 끝, 닫힌 도형의 상하좌우 끝점 */
  anchors: Anchor[];
}

const unit = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

/** 경로 명령을 짧은 선분들로 쪼개고, 연결 후보점과 그 방향을 모읍니다. */
function geoOf(cmds: Cmd[]): Geo {
  const segs: Seg[] = [];
  const anchors: Anchor[] = [];
  let sub: Pt[] = [];
  let closed = false;
  const flush = () => {
    if (sub.length < 2) {
      sub = [];
      closed = false;
      return;
    }
    for (let i = 1; i < sub.length; i++) segs.push([sub[i - 1], sub[i]]);
    const first = sub[0];
    const last = sub[sub.length - 1];
    const loops = closed || dist(first, last) < 0.5;
    if (loops) {
      let cx = 0, cy = 0;
      for (const p of sub) {
        cx += p[0];
        cy += p[1];
      }
      const center: Pt = [cx / sub.length, cy / sub.length];
      let top = sub[0], bottom = sub[0], left = sub[0], right = sub[0];
      for (const p of sub) {
        if (p[1] < top[1]) top = p;
        if (p[1] > bottom[1]) bottom = p;
        if (p[0] < left[0]) left = p;
        if (p[0] > right[0]) right = p;
      }
      for (const p of [top, bottom, left, right]) anchors.push({ p, dir: unit([p[0] - center[0], p[1] - center[1]]) });
    } else {
      // 열린 획의 끝: 획이 진행하던 방향을 그대로 이어 가는 쪽이 바깥입니다.
      const back = (from: number, step: number): Pt => {
        let i = from + step;
        while (i > 0 && i < sub.length - 1 && dist(sub[i], sub[from]) < 3) i += step;
        return sub[Math.max(0, Math.min(sub.length - 1, i))];
      };
      anchors.push({ p: first, dir: unit([first[0] - back(0, 1)[0], first[1] - back(0, 1)[1]]) });
      const lb = back(sub.length - 1, -1);
      anchors.push({ p: last, dir: unit([last[0] - lb[0], last[1] - lb[1]]) });
    }
    sub = [];
    closed = false;
  };
  let cur: Pt = [0, 0];
  for (const c of cmds) {
    if (c[0] === 'M') {
      flush();
      cur = [c[1], c[2]];
      sub = [cur];
    } else if (c[0] === 'L') {
      cur = [c[1], c[2]];
      sub.push(cur);
    } else if (c[0] === 'Q') {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        sub.push([u * u * cur[0] + 2 * u * t * c[1] + t * t * c[3], u * u * cur[1] + 2 * u * t * c[2] + t * t * c[4]]);
      }
      cur = [c[3], c[4]];
    } else if (c[0] === 'C') {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        sub.push([
          u * u * u * cur[0] + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
          u * u * u * cur[1] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
        ]);
      }
      cur = [c[5], c[6]];
    } else {
      closed = true;
      if (sub.length) sub.push(sub[0]);
    }
  }
  flush();
  return { segs, anchors };
}

function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + dx * t, a[1] + dy * t];
}

/** 두 선분이 서로 가로지르는지 (끝점이 닿는 정도는 제외) */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
}

interface Contact {
  /** 연결의 시작(획의 끝) a, 도착(다른 자소의 선 위) b */
  a: Pt;
  b: Pt;
  d: number;
  /** a에서 뻗는 방향 */
  dirA: Pt;
  /** b에서 a 쪽을 향하는 도착면의 법선 */
  normB: Pt;
  /** a가 앞 자소(true)에 있는지 */
  fromFirst: boolean;
}

/** 연결선이 이 각도(코사인) 이상 획의 진행 방향과 어긋나면 어색해서 잇지 않습니다. */
const MIN_ALIGN = 0.5;

/**
 * 두 자소 사이에서 이을 만한 가장 가까운 (획의 끝 → 다른 자소의 선) 쌍을 찾습니다.
 * - 획이 뻗던 방향과 크게 어긋나게 꺾이는 연결은 제외
 * - 연결선이 두 자소의 다른 획을 가로지르는 연결은 제외
 */
function nearestContact(ga: Geo, gb: Geo): Contact | null {
  let best: Contact | null = null;
  const allSegs = [...ga.segs, ...gb.segs];
  const consider = (an: Anchor, other: Geo, fromFirst: boolean) => {
    for (const [s0, s1] of other.segs) {
      const q = closestOnSegment(an.p, s0, s1);
      const d = dist(an.p, q);
      if (d < 0.5) continue;
      if (best && d >= best.d) continue;
      const u = unit([q[0] - an.p[0], q[1] - an.p[1]]);
      if (u[0] * an.dir[0] + u[1] * an.dir[1] < MIN_ALIGN) continue;
      // 연결선이 다른 획을 가로지르면 건너뜁니다. (연결하려는 두 점 근처의 선은 제외)
      let blocked = false;
      for (const [c0, c1] of allSegs) {
        if (dist(closestOnSegment(an.p, c0, c1), an.p) < 1.5) continue;
        if (dist(closestOnSegment(q, c0, c1), q) < 1.5) continue;
        if (crosses(an.p, q, c0, c1)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      let n = unit([-(s1[1] - s0[1]), s1[0] - s0[0]]);
      if (n[0] * (an.p[0] - q[0]) + n[1] * (an.p[1] - q[1]) < 0) n = [-n[0], -n[1]];
      best = { a: an.p, b: q, d, dirA: an.dir, normB: n, fromFirst };
    }
  };
  for (const an of ga.anchors) consider(an, gb, true);
  for (const an of gb.anchors) consider(an, ga, false);
  return best;
}

function translateCmds(cmds: Cmd[], dx: number, dy: number): Cmd[] {
  return cmds.map((c): Cmd => {
    switch (c[0]) {
      case 'M':
      case 'L':
        return [c[0], c[1] + dx, c[2] + dy];
      case 'Q':
        return ['Q', c[1] + dx, c[2] + dy, c[3] + dx, c[4] + dy];
      case 'C':
        return ['C', c[1] + dx, c[2] + dy, c[3] + dx, c[4] + dy, c[5] + dx, c[6] + dy];
      default:
        return c;
    }
  });
}

/**
 * 이웃한 자소(초성-모음, 모음-받침)가 reach 안에서 가까우면 이어 줍니다.
 * snap: 뒤 자소를 움직여 닿게 하고, bridge/curve: 두 점 사이에 선을 하나 더 긋습니다.
 */
function linkParts(parts: Cmd[][], reach: number, mode: JamoParams['linkMode']): Cmd[] {
  const bridges: Cmd[] = [];
  if (reach <= 0.5) return bridges;
  for (let i = 0; i + 1 < parts.length; i++) {
    if (!parts[i].length || !parts[i + 1].length) continue;
    const hit = nearestContact(geoOf(parts[i]), geoOf(parts[i + 1]));
    if (!hit) continue;
    // 붙이기는 자소를 움직이므로 잇기보다 짧은 거리만 허용해 글자가 엉키지 않게 합니다.
    if (hit.d > (mode === 'snap' ? reach * 0.45 : reach)) continue;
    if (mode === 'snap') {
      // 뒤 자소가 움직입니다. 획의 끝이 뒤 자소에 있으면 그 끝을, 앞 자소에 있으면 도착점을 맞춥니다.
      const dx = hit.fromFirst ? hit.a[0] - hit.b[0] : hit.b[0] - hit.a[0];
      const dy = hit.fromFirst ? hit.a[1] - hit.b[1] : hit.b[1] - hit.a[1];
      parts[i + 1] = translateCmds(parts[i + 1], dx, dy);
    } else if (mode === 'curve' && hit.d > 5) {
      // 획이 뻗던 방향으로 나가서, 도착하는 선에는 수직으로 부드럽게 닿는 곡선
      const k = hit.d * 0.5;
      bridges.push(
        ['M', hit.a[0], hit.a[1]],
        ['C', hit.a[0] + hit.dirA[0] * k, hit.a[1] + hit.dirA[1] * k, hit.b[0] + hit.normB[0] * k, hit.b[1] + hit.normB[1] * k, hit.b[0], hit.b[1]],
      );
    } else {
      bridges.push(['M', hit.a[0], hit.a[1]], ['L', hit.b[0], hit.b[1]]);
    }
  }
  return bridges;
}

/**
 * 직접 그린 점들을 경로로 바꿉니다. 점이 모두 '꺾임'이면 일반 꺾은선(꺾임 둥글기 적용),
 * 하나라도 '부드러움'이면 이웃 점을 따라 부드럽게 휘는 곡선(Catmull-Rom)으로 만듭니다.
 */
export function nodesToCmds(nodes: SkelNode[], closed: boolean, radius: number): Cmd[] {
  const n = nodes.length;
  if (n < 2) return [];
  if (!nodes.some((nd) => nd.s)) return roundedPoly(nodes.map((nd) => [nd.x, nd.y] as Pt), closed, radius);
  const P = (i: number): Pt => {
    const j = closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
    return [nodes[j].x, nodes[j].y];
  };
  const cmds: Cmd[] = [['M', nodes[0].x, nodes[0].y]];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const a = nodes[i % n];
    const b = nodes[(i + 1) % n];
    if (!a.s && !b.s) {
      cmds.push(['L', p2[0], p2[1]]);
    } else {
      const c1: Pt = a.s ? [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6] : p1;
      const c2: Pt = b.s ? [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6] : p2;
      cmds.push(['C', c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]]);
    }
  }
  if (closed) cmds.push(['Z']);
  return cmds;
}

function strokeCmds(s: PlacedStroke, radius: number, local: JamoParams): Cmd[] {
  if (s.t === 'poly') return roundedPoly(s.pts, s.closed, radius);
  if (s.t === 'path') return nodesToCmds(s.nodes, s.closed, radius);
  if (s.t === 'bez') return s.ops as Cmd[];
  return ringCmds(s.c, s.rx, s.ry, s.rot, local, Math.min(radius, Math.min(s.rx, s.ry) * 0.9));
}

/** 굵기 대비 설정을 설계 단위의 가로·세로 굵기로 바꿉니다. (기준 굵기는 가로·세로의 중간값) */
function contrastOptions(jp: JamoParams, mult: number) {
  const base = ((jp.strokeW * 1000) / (CELL / DESIGN)) * mult;
  const c = Math.abs(jp.contrast);
  const thick = base * (1 + 0.5 * c);
  const thin = base * (1 - 0.8 * c);
  return {
    widthH: jp.contrast > 0 ? thin : thick,
    widthV: jp.contrast > 0 ? thick : thin,
    cap: jp.cap,
    join: (jp.cap === 'round' || jp.roundness > 0 ? 'round' : 'miter') as 'round' | 'miter',
    miterLimit: 3,
  };
}

export function buildJamoGlyph(
  ch: string,
  jp: JamoParams,
  index: number,
  ov?: GlyphOverride,
  variants?: Record<string, number>,
  custom?: Record<string, SkelStroke[]>,
): GlyphShape | null {
  const syl = decompose(ch);
  const placed = syl ? assemble(syl, jp, ov, variants, custom, index) : assembleLoose(ch, jp, variants, custom);
  if (!placed) return null;
  const radius = jp.roundness * 14;
  // 이 글자만 ㅇ 모양·열림이 다를 수 있습니다.
  const local: JamoParams = { ...jp, oShape: ov?.oShape ?? jp.oShape, circleGap: ov?.circleGap ?? jp.circleGap };
  const partCmds = placed.parts.map((strokes) => strokes.flatMap((s) => strokeCmds(s, radius, local)));
  const link = ov?.link ?? jp.link;
  const linked: Cmd[] =
    jp.linkMode === 'flow'
      ? flowMerge(partCmds.flat(), link * FLOW_MAX_REACH)
      : [...partCmds.flat(), ...linkParts(partCmds, link * LINK_MAX_REACH, jp.linkMode)];
  // 부리는 연결이 끝난 뒤 남은 '자유로운' 획 끝에만 붙입니다.
  const hooked = addHooksDetailed(linked, { start: jp.hookStart, end: jp.hookEnd, style: jp.hookStyle, flip: jp.hookFlip });
  const cmds =
    jp.contrast !== 0 || jp.taper > 0
      ? variableStroke(hooked.cmds, {
          ...contrastOptions(jp, ov?.stroke ?? 1),
          tips: hooked.tips,
          tipScale: 0.22,
          taper: jp.taper,
        })
      : hooked.cmds;
  const bounce = jp.bounce * 1000 * (index % 2 === 0 ? 1 : -1);
  return { char: ch, cmds: toGlyphSpace(cmds, bounce), advance: CELL, fromFallback: false };
}

/** UI 미리보기: 한 자모의 한 가지 모양을 0..100 상자의 SVG 경로 문자열로 만듭니다. */
export function previewPath(ch: string, idx: number): string {
  const strokes: PlacedStroke[] = [];
  const pick: Pick = { get: () => idx, forced: true };
  const rect: Rect = [16, 16, 84, 84];
  if (ch in CONS_VARIANTS) placeConsonant(ch, rect, strokes, pick);
  else placeVowel(ch, rect, strokes, pick);
  const jp = { circleGap: 0, oShape: 'circle' } as JamoParams;
  const cmds: Cmd[] = [];
  for (const s of strokes) {
    if (s.t === 'poly') cmds.push(...roundedPoly(s.pts, s.closed, 0));
    else if (s.t === 'path') cmds.push(...nodesToCmds(s.nodes, s.closed, 0));
    else if (s.t === 'bez') cmds.push(...(s.ops as Cmd[]));
    else cmds.push(...ringCmds(s.c, s.rx, s.ry, s.rot, jp, 0));
  }
  const f = (n: number) => Math.round(n * 10) / 10;
  return cmds
    .map((c) => (c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map((n) => f(n as number)).join(' ')))
    .join('');
}

/** 글자별 편집용: 한 부분(예: ㄲ, ㅘ, ㄺ)에서 모양을 고를 수 있는 대표 자모 */
export function partVariantChar(part: string): string | undefined {
  const comp = COMPOUND[part];
  const cands = comp ? [comp[0], comp[1]] : PAIRS[part] ? [...PAIRS[part]] : [part];
  return cands.find((c) => variantNames(c).length > 0);
}

// ───────────────────────── 뼈대 편집기용 ─────────────────────────

/** 직접 그릴 수 있는 자모인지 (기본 자음·모음) */
export function isEditableJamo(ch: string): boolean {
  return ch in CONS_VARIANTS || ch in VOWEL_VARIANTS;
}

/** 텍스트에 쓰인 기본 자음·모음 (쌍자음·겹받침·겹모음은 기본 자모로 풀어서, 등장 순서·중복 없음) */
export function jamoCharsIn(text: string): string[] {
  const out: string[] = [];
  const add = (c: string) => {
    if (isEditableJamo(c) && !out.includes(c)) out.push(c);
  };
  const addConsonant = (c: string) => (PAIRS[c] ? PAIRS[c].forEach(add) : add(c));
  for (const ch of Array.from(text)) {
    const syl = decompose(ch);
    if (syl) {
      addConsonant(syl.initial);
      const comp = COMPOUND[syl.medial];
      if (comp) {
        add(comp[0]);
        add(comp[1]);
      } else add(syl.medial);
      if (syl.final) addConsonant(syl.final);
    } else if (ch in CONS_VARIANTS || ch in PAIRS) addConsonant(ch);
    else if (ch in VOWEL_VARIANTS) add(ch);
  }
  return out;
}

/** 뼈대 하나를 편집할 수 있는 점 목록으로 바꿉니다. (곡선은 부드러운 점으로 근사) */
function toEditable(strokes: Stroke[]): SkelStroke[] {
  const out: SkelStroke[] = [];
  for (const s of strokes) {
    if (s.t === 'ring') out.push({ t: 'ring', c: [s.c[0], s.c[1]], r: s.r });
    else if (s.t === 'path') out.push({ t: 'path', nodes: s.nodes.map((n) => ({ ...n })), ...(s.closed ? { closed: true } : {}) });
    else if (s.t === 'poly') {
      out.push({ t: 'path', nodes: s.pts.map(([x, y]) => ({ x, y })), ...(s.closed ? { closed: true } : {}) });
    } else {
      // bez: M / L / Q / Z → 점들. Q는 곡선 위 가운데 점을 부드러운 점으로 추가합니다.
      let nodes: SkelNode[] = [];
      let closed = false;
      let cur: Pt = [0, 0];
      const flush = () => {
        if (nodes.length >= 2) out.push({ t: 'path', nodes, ...(closed ? { closed: true } : {}) });
        nodes = [];
        closed = false;
      };
      s.ops.forEach((o, i) => {
        if (o[0] === 'M') {
          flush();
          cur = [o[1], o[2]];
          nodes.push({ x: cur[0], y: cur[1] });
        } else if (o[0] === 'L') {
          cur = [o[1], o[2]];
          nodes.push({ x: cur[0], y: cur[1] });
        } else if (o[0] === 'Q') {
          const mid: Pt = [0.25 * cur[0] + 0.5 * o[1] + 0.25 * o[3], 0.25 * cur[1] + 0.5 * o[2] + 0.25 * o[4]];
          nodes.push({ x: mid[0], y: mid[1], s: true });
          const nextIsQ = s.ops[i + 1]?.[0] === 'Q';
          nodes.push({ x: o[3], y: o[4], ...(nextIsQ ? { s: true } : {}) });
          cur = [o[3], o[4]];
        } else {
          closed = true;
        }
      });
      flush();
    }
  }
  return out;
}

/** 편집을 시작할 때 보여 줄 뼈대: 직접 그린 것이 있으면 그것, 없으면 선택된 기본 모양 */
export function editableStrokes(
  ch: string,
  variantIdx: number,
  custom?: Record<string, SkelStroke[]>,
  own?: Record<string, SkelStroke[]>,
): SkelStroke[] {
  if (own?.[ch]?.length) return JSON.parse(JSON.stringify(own[ch])) as SkelStroke[];
  if (custom?.[ch]?.length) return JSON.parse(JSON.stringify(custom[ch])) as SkelStroke[];
  const table = ch in CONS_VARIANTS ? CONS_VARIANTS : VOWEL_VARIANTS;
  const strokes = variantStrokes(table, ch, { get: () => variantIdx, forced: true });
  return strokes ? toEditable(strokes) : [];
}

/** 편집기에서 보여 줄 한 획의 SVG 경로 (설계 좌표 0..100) */
export function skeletonStrokePath(s: SkelStroke): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  const cmds: Cmd[] =
    s.t === 'ring'
      ? [...ringCmds([s.c[0] * 100, s.c[1] * 100], s.r * 100, s.r * 100, 0, { circleGap: 0, oShape: 'circle' } as JamoParams, 0)]
      : nodesToCmds(
          s.nodes.map((n) => ({ ...n, x: n.x * 100, y: n.y * 100 })),
          !!s.closed,
          0,
        );
  return cmds.map((c) => (c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map((n) => f(n as number)).join(' '))).join('');
}
