import type { BBox, Cmd, GlyphShape, Params, Wordmark } from './types';
import { UNIT } from './types';
import { FALLBACK_FONT_ID, getFont } from '../data/fonts';
import { axisValue, compensateWght, getGlyph, isFontLoaded } from './fontStore';
import { buildJamoGlyph } from './jamo';

/** 외곽선 보정으로 굵기를 줄 때 모서리 둥글림에 쓰는 최대 선 두께(em) */
const CORNER_MAX_EM = 0.08;
const SPACE_ADVANCE = 300;

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export interface StrokeSpec {
  linecap: 'round' | 'butt' | 'square';
  fill: boolean;
  knockout: boolean;
  strokeWidth: number;
  linejoin: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  opacity: number;
}

/** 파라미터가 선(stroke)으로 만들어 내는 모양을 계산합니다. */
export function strokeSpec(p: Params): StrokeSpec {
  if (p.engine === 'jamo') {
    const j = p.jamo;
    return {
      fill: false,
      knockout: false,
      linecap: j.cap,
      strokeWidth: j.strokeW * UNIT,
      linejoin: j.cap === 'round' || j.roundness > 0 ? 'round' : 'miter',
      miterLimit: 4,
      opacity: p.overlapOn ? p.overlapOpacity : 1,
    };
  }
  const def = getFont(p.fontId);
  const cornerStroke = p.corner === 'sharp' ? 0 : p.cornerAmount * CORNER_MAX_EM * UNIT;
  const weightStroke =
    def.weight.kind === 'stroke' ? Math.max(0, p.weight) * def.weight.maxEm * UNIT : 0;
  const linejoin = p.corner === 'sharp' ? 'miter' : p.corner;
  if (p.outlineOn) {
    return {
      linecap: 'butt',
      fill: false,
      knockout: true,
      // 안쪽 절반은 지워지므로, 보이는 두께의 2배로 그립니다.
      strokeWidth: p.outlineWidth * UNIT * 2,
      linejoin,
      miterLimit: 3,
      opacity: p.overlapOn ? p.overlapOpacity : 1,
    };
  }
  return {
    linecap: 'butt',
    fill: true,
    knockout: false,
    strokeWidth: weightStroke + cornerStroke,
    linejoin,
    miterLimit: 2.5,
    opacity: p.overlapOn ? p.overlapOpacity : 1,
  };
}

interface Placed {
  d: string;
  pts: [number, number][];
  box: { minX: number; minY: number; maxX: number; maxY: number };
}

function transformGlyph(
  g: GlyphShape,
  ox: number,
  sx: number,
  sy: number,
  skewTan: number,
): Placed {
  const pts: [number, number][] = [];
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (X: number, Y: number) => {
    pts.push([X, Y]);
    if (X < box.minX) box.minX = X;
    if (X > box.maxX) box.maxX = X;
    if (Y < box.minY) box.minY = Y;
    if (Y > box.maxY) box.maxY = Y;
  };
  const tx = (x: number, yUp: number): [number, number] => [ox + x * sx + yUp * sy * skewTan, -yUp * sy];
  // 곡선의 범위는 제어점이 아니라 곡선 위의 점으로 계산해야 여백이 실제 글자 모양에 맞습니다.
  const STEPS = 8;
  let cur: [number, number] = [0, 0];
  let d = '';
  for (const c of g.cmds as Cmd[]) {
    switch (c[0]) {
      case 'M': {
        const [x, y] = tx(c[1], c[2]);
        d += `M${fmt(x)} ${fmt(y)}`;
        grow(x, y);
        cur = [x, y];
        break;
      }
      case 'L': {
        const [x, y] = tx(c[1], c[2]);
        d += `L${fmt(x)} ${fmt(y)}`;
        grow(x, y);
        cur = [x, y];
        break;
      }
      case 'Q': {
        const [x1, y1] = tx(c[1], c[2]);
        const [x, y] = tx(c[3], c[4]);
        d += `Q${fmt(x1)} ${fmt(y1)} ${fmt(x)} ${fmt(y)}`;
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const u = 1 - t;
          grow(u * u * cur[0] + 2 * u * t * x1 + t * t * x, u * u * cur[1] + 2 * u * t * y1 + t * t * y);
        }
        cur = [x, y];
        break;
      }
      case 'C': {
        const [x1, y1] = tx(c[1], c[2]);
        const [x2, y2] = tx(c[3], c[4]);
        const [x, y] = tx(c[5], c[6]);
        d += `C${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)}`;
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const u = 1 - t;
          grow(
            u * u * u * cur[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
            u * u * u * cur[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
          );
        }
        cur = [x, y];
        break;
      }
      case 'Z':
        d += 'Z';
        break;
    }
  }
  return { d, pts, box };
}

/**
 * 텍스트와 파라미터로 워드마크 형상을 만듭니다. 필요한 글꼴이 아직 로드되지 않았다면 null.
 *
 * 처리 순서: 글자별 윤곽선 → 가로/세로 비율 → 기울기 → 자간·겹침 배치 → bbox.
 * 비율과 기울기는 점 좌표에 직접 적용하므로, 선 두께가 늘어나거나 찌그러지지 않습니다.
 */
export function buildWordmark(text: string, p: Params): Wordmark | null {
  const jamo = p.engine === 'jamo';
  if (!jamo && !isFontLoaded(p.fontId)) return null;
  const def = getFont(p.fontId);
  const spec = strokeSpec(p);
  let wght = jamo ? null : axisValue(def, p.weight);
  // 모서리 선이 더한 두께만큼 가변 글꼴의 굵기 축을 낮춰 시각적 굵기를 유지합니다.
  if (wght !== null && !p.outlineOn && p.corner !== 'sharp') wght = compensateWght(def, wght, spec.strokeWidth);
  const fbDef = getFont(FALLBACK_FONT_ID);
  const fbWght = axisValue(fbDef, p.weight);

  const sx = p.width / 100;
  const sy = p.vScaleOn ? p.vScale / 100 : 1;
  const skewTan = p.skewOn ? Math.tan((p.skew * Math.PI) / 180) : 0;
  const gap = p.tracking * UNIT - (p.overlapOn ? p.overlapAmount * UNIT : 0);

  const fallbackChars: string[] = [];
  const missingChars: string[] = [];
  const paths: string[] = [];
  const widths: number[] = [];
  const glyphBoxes: Placed['box'][] = [];
  const all: [number, number][] = [];
  let cursor = 0;

  let drawn = 0;
  for (const ch of Array.from(text)) {
    if (jamo && ch !== ' ') {
      // 자소 조립 모드는 한글만 그립니다. 그 밖의 글자는 그리지 않고 알립니다.
      const ov = p.glyphs[drawn];
      const g = buildJamoGlyph(ch, p.jamo, drawn, ov, p.variants);
      if (!g) {
        if (!missingChars.includes(ch)) missingChars.push(ch);
        continue;
      }
      drawn++;
      const placed = transformGlyph(g, cursor, sx, sy, skewTan);
      paths.push(placed.d);
      widths.push(p.jamo.strokeW * UNIT * (ov?.stroke ?? 1));
      glyphBoxes.push(placed.box);
      for (const pt of placed.pts) all.push(pt);
      cursor += g.advance * sx + gap;
      continue;
    }
    let g = jamo ? null : getGlyph(p.fontId, wght, ch);
    let fromFallback = false;
    if (!g && ch !== ' ') {
      // 선택한 글꼴에 글자가 없으면 대체 글꼴로 그립니다.
      if (p.fontId !== FALLBACK_FONT_ID) {
        if (!isFontLoaded(FALLBACK_FONT_ID)) return null;
        g = getGlyph(FALLBACK_FONT_ID, fbWght, ch);
        fromFallback = !!g;
      }
      if (!g) {
        missingChars.push(ch);
        continue;
      }
    }
    if (ch === ' ') {
      cursor += SPACE_ADVANCE * sx + gap;
      continue;
    }
    const shape = g!;
    if (fromFallback && !fallbackChars.includes(ch)) fallbackChars.push(ch);
    const placed = transformGlyph(shape, cursor, sx, sy, skewTan);
    paths.push(placed.d);
    widths.push(-1);
    glyphBoxes.push(placed.box);
    for (const pt of placed.pts) all.push(pt);
    cursor += shape.advance * sx + gap;
  }

  const maxW = Math.max(spec.strokeWidth, ...widths);
  const half = maxW / 2;
  let bbox: BBox;
  if (all.length === 0) {
    bbox = { x: 0, y: -800, w: 1000, h: 1000 };
  } else {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of all) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // 둥근/각진 모서리의 선은 윤곽선 바깥으로 half만큼 나옵니다. miter는 최대 miterLimit배.
    const grow =
      spec.linejoin === 'miter' ? half * spec.miterLimit : spec.linecap === 'square' ? half * 1.5 : half;
    bbox = {
      x: minX - grow,
      y: minY - grow,
      w: maxX - minX + grow * 2,
      h: maxY - minY + grow * 2,
    };
  }
  const boxes: BBox[] = glyphBoxes.map((b, i) => {
    const g = (widths[i] > 0 ? widths[i] : spec.strokeWidth) / 2;
    return { x: b.minX - g, y: b.minY - g, w: b.maxX - b.minX + g * 2, h: b.maxY - b.minY + g * 2 };
  });
  return {
    paths,
    bbox,
    ...spec,
    widths: widths.map((w) => (w > 0 ? w : spec.strokeWidth)),
    boxes,
    fallbackChars,
    missingChars,
  };
}
