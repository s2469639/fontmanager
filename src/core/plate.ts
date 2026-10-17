/**
 * 배경 판: 글자 상자(bbox)를 여백만큼 키운 둥근 사각형 또는 타원.
 * 화면(SVG)과 PNG(Canvas)가 같은 경로 문자열을 씁니다.
 */
import type { BBox, PlateParams, PlateShape } from './types';
import { UNIT } from './types';

export function plateFor(text: BBox, pl: PlateParams): PlateShape | undefined {
  if (!pl.on) return undefined;
  let w = text.w + pl.padX * UNIT * 2;
  let h = text.h + pl.padY * UNIT * 2;
  if (pl.square) w = h = Math.max(w, h);
  const cx = text.x + text.w / 2;
  const cy = text.y + text.h / 2;
  const rx = pl.shape === 'ellipse' ? w / 2 : (pl.radius * Math.min(w, h)) / 2;
  const ry = pl.shape === 'ellipse' ? h / 2 : rx;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rx, ry, color: pl.color };
}

export function platePath(p: PlateShape): string {
  const { x, y, w, h, rx, ry } = p;
  const f = (n: number) => Math.round(n * 100) / 100;
  return [
    `M${f(x + rx)} ${f(y)}`,
    `H${f(x + w - rx)}`,
    `A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w)} ${f(y + ry)}`,
    `V${f(y + h - ry)}`,
    `A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w - rx)} ${f(y + h)}`,
    `H${f(x + rx)}`,
    `A${f(rx)} ${f(ry)} 0 0 1 ${f(x)} ${f(y + h - ry)}`,
    `V${f(y + ry)}`,
    `A${f(rx)} ${f(ry)} 0 0 1 ${f(x + rx)} ${f(y)}`,
    'Z',
  ].join('');
}
