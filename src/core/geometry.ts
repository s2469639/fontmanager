import type { BBox, Cmd, GlyphShape, Params, Wordmark } from './types';
import { UNIT } from './types';
import { FALLBACK_FONT_ID, getFont } from '../data/fonts';
import { axisValue, compensateWght, getGlyph, isFontLoaded } from './fontStore';
import { buildJamoGlyph } from './jamo';
import { deform, flatten, fxActive, segmentLength, stripeBands, subsToCmds } from './effects';

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
    // 굵기 대비가 켜지면 선 대신 굵기가 변하는 면으로 그리므로 선(stroke) 없이 채웁니다.
    if (j.contrast !== 0) {
      return {
        fill: true,
        knockout: false,
        linecap: 'butt',
        strokeWidth: 0,
        linejoin: 'miter',
        miterLimit: 2.5,
        opacity: p.overlapOn ? p.overlapOpacity : 1,
      };
    }
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

/** 글꼴 좌표(em=1000, y 위로)의 글자를 최종 화면 좌표(y 아래로)로 옮깁니다. */
function toFinalCmds(g: GlyphShape, ox: number, sx: number, sy: number, skewTan: number): Cmd[] {
  const tx = (x: number, yUp: number): [number, number] => [ox + x * sx + yUp * sy * skewTan, -yUp * sy];
  return (g.cmds as Cmd[]).map((c): Cmd => {
    switch (c[0]) {
      case 'M':
      case 'L': {
        const [x, y] = tx(c[1], c[2]);
        return [c[0], x, y];
      }
      case 'Q': {
        const [x1, y1] = tx(c[1], c[2]);
        const [x, y] = tx(c[3], c[4]);
        return ['Q', x1, y1, x, y];
      }
      case 'C': {
        const [x1, y1] = tx(c[1], c[2]);
        const [x2, y2] = tx(c[3], c[4]);
        const [x, y] = tx(c[5], c[6]);
        return ['C', x1, y1, x2, y2, x, y];
      }
      default:
        return c;
    }
  });
}

/** 경로 문자열과 범위를 계산합니다. 곡선의 범위는 제어점이 아니라 곡선 위의 점으로 잽니다. */
function measure(cmds: Cmd[]): Placed {
  const pts: [number, number][] = [];
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (X: number, Y: number) => {
    pts.push([X, Y]);
    if (X < box.minX) box.minX = X;
    if (X > box.maxX) box.maxX = X;
    if (Y < box.minY) box.minY = Y;
    if (Y > box.maxY) box.maxY = Y;
  };
  const STEPS = 8;
  let cur: [number, number] = [0, 0];
  let d = '';
  for (const c of cmds) {
    switch (c[0]) {
      case 'M':
      case 'L': {
        d += `${c[0]}${fmt(c[1])} ${fmt(c[2])}`;
        grow(c[1], c[2]);
        cur = [c[1], c[2]];
        break;
      }
      case 'Q': {
        d += `Q${fmt(c[1])} ${fmt(c[2])} ${fmt(c[3])} ${fmt(c[4])}`;
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const u = 1 - t;
          grow(u * u * cur[0] + 2 * u * t * c[1] + t * t * c[3], u * u * cur[1] + 2 * u * t * c[2] + t * t * c[4]);
        }
        cur = [c[3], c[4]];
        break;
      }
      case 'C': {
        d += `C${fmt(c[1])} ${fmt(c[2])} ${fmt(c[3])} ${fmt(c[4])} ${fmt(c[5])} ${fmt(c[6])}`;
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const u = 1 - t;
          grow(
            u * u * u * cur[0] + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
            u * u * u * cur[1] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
          );
        }
        cur = [c[5], c[6]];
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
  const raws: Cmd[][] = [];
  const widths: number[] = [];
  let cursor = 0;

  let drawn = 0;
  for (const ch of Array.from(text)) {
    if (jamo && ch !== ' ') {
      // 자소 조립 모드는 한글만 그립니다. 그 밖의 글자는 그리지 않고 알립니다.
      const ov = p.glyphs[drawn];
      const g = buildJamoGlyph(ch, p.jamo, drawn, ov, p.variants, p.skeletons);
      if (!g) {
        if (!missingChars.includes(ch)) missingChars.push(ch);
        continue;
      }
      drawn++;
      raws.push(toFinalCmds(g, cursor, sx, sy, skewTan));
      widths.push(p.jamo.contrast !== 0 ? 0 : p.jamo.strokeW * UNIT * (ov?.stroke ?? 1));
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
    raws.push(toFinalCmds(shape, cursor, sx, sy, skewTan));
    widths.push(-1);
    cursor += shape.advance * sx + gap;
  }

  // 글자별 범위를 재고, 형태 변형 효과(거칠게·물결·부풀림)가 켜져 있으면 점을 움직인 뒤 다시 잽니다.
  let placedList = raws.map(measure);
  if (fxActive(p.fx) && placedList.length) {
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
    for (const { box } of placedList) {
      ux0 = Math.min(ux0, box.minX);
      uy0 = Math.min(uy0, box.minY);
      ux1 = Math.max(ux1, box.maxX);
      uy1 = Math.max(uy1, box.maxY);
    }
    const wordCenter: [number, number] = [(ux0 + ux1) / 2, (uy0 + uy1) / 2];
    const wordRadius = Math.hypot(ux1 - ux0, uy1 - uy0) / 2;
    const seg = segmentLength(p.fx);
    placedList = raws.map((cmds, i) => {
      const b = placedList[i].box;
      const ctx = {
        glyphCenter: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] as [number, number],
        glyphRadius: (Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2) * 1.05,
        wordCenter,
        wordRadius: wordRadius * 1.05,
      };
      return measure(subsToCmds(deform(flatten(cmds, seg), p.fx, ctx)));
    });
  }
  const paths = placedList.map((pl) => pl.d);
  const glyphBoxes = placedList.map((pl) => pl.box);
  const all: [number, number][] = placedList.flatMap((pl) => pl.pts);

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
    cuts: stripeBands(p.fx, bbox),
    ...spec,
    widths: widths.map((w) => (w > 0 ? w : spec.strokeWidth)),
    boxes,
    fallbackChars,
    missingChars,
  };
}
