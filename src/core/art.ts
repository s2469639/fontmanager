/**
 * 첨부한 그림(예: 글자 뒤에 깔 일러스트) 레이어.
 * 위치는 워드마크 bbox 중심에서 얼마나 떨어져 있는지(ox, oy)로 저장해,
 * 글자가 바뀌어도 그림이 글자와 함께 움직입니다. 단위는 em = 1000.
 */
import type { BBox } from './types';

export interface ArtLayer {
  id: string;
  name: string;
  /** blob URL */
  src: string;
  natW: number;
  natH: number;
  /** 워드마크 중심에서의 이동 */
  ox: number;
  oy: number;
  /** 그림의 가로 길이 (세로는 원본 비율로 따라감) */
  width: number;
  rot: number;
  opacity: number;
  flipX: boolean;
  /** true면 글자 위에 그림 */
  front: boolean;
}

type Pt = [number, number];

export const MAX_ART_BYTES = 25 * 1024 * 1024;
export const MAX_ART_PIXELS = 40_000_000;
export const MAX_ART_LAYERS = 6;

export const artHeight = (l: ArtLayer) => (l.width * l.natH) / Math.max(1, l.natW);

export function wordCenter(box: BBox): Pt {
  return [box.x + box.w / 2, box.y + box.h / 2];
}

/** 그림 사각형의 네 꼭짓점 (회전 반영) */
export function artCorners(l: ArtLayer, center: Pt): Pt[] {
  const cx = center[0] + l.ox;
  const cy = center[1] + l.oy;
  const hw = l.width / 2;
  const hh = artHeight(l) / 2;
  const a = (l.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as Pt[]).map(([x, y]) => [
    cx + x * cos - y * sin,
    cy + x * sin + y * cos,
  ]);
}

/** 워드마크와 모든 그림을 감싸는 사각형 */
export function contentBox(wm: BBox, art: ArtLayer[]): BBox {
  let x0 = wm.x, y0 = wm.y, x1 = wm.x + wm.w, y1 = wm.y + wm.h;
  const c = wordCenter(wm);
  for (const l of art) {
    for (const [x, y] of artCorners(l, c)) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 화면 좌표에 그릴 때 쓰는 transform 문자열 */
export function artTransform(l: ArtLayer, center: Pt): string {
  const cx = center[0] + l.ox;
  const cy = center[1] + l.oy;
  return `translate(${cx} ${cy}) rotate(${l.rot}) scale(${l.flipX ? -1 : 1} 1)`;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadArtImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('그림을 불러오지 못했습니다.'));
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

export class ArtError extends Error {}

/** 파일을 읽어 레이어에 필요한 정보로 바꿉니다. 문제가 있으면 ArtError. */
export async function readArtFile(file: File): Promise<{ src: string; name: string; natW: number; natH: number }> {
  if (!file.type.startsWith('image/')) throw new ArtError('이미지 파일만 넣을 수 있어요. (PNG, WebP, JPG, SVG)');
  if (file.size > MAX_ART_BYTES) throw new ArtError('파일이 너무 커요. 25MB 이하로 줄여 주세요.');
  const src = URL.createObjectURL(file);
  try {
    const img = await loadArtImage(src);
    const natW = img.naturalWidth || 1000;
    const natH = img.naturalHeight || 1000;
    if (natW * natH > MAX_ART_PIXELS) throw new ArtError('그림의 해상도가 너무 커요. 6000×6000 이하로 줄여 주세요.');
    return { src, name: file.name, natW, natH };
  } catch (e) {
    URL.revokeObjectURL(src);
    imageCache.delete(src);
    throw e instanceof ArtError ? e : new ArtError('그림을 열 수 없어요. 다른 파일로 시도해 주세요.');
  }
}

export function disposeArt(l: ArtLayer) {
  URL.revokeObjectURL(l.src);
  imageCache.delete(l.src);
}
