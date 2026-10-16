import type { Wordmark } from './types';
import { UNIT } from './types';

export interface ExportOptions {
  color: string;
  /** 1em당 픽셀 수 */
  pxPerEm: number;
  /** 여백(em) */
  padEm: number;
}

export const MAX_SIDE = 8192;
export const MAX_AREA = 16_000_000;

export interface ExportSize {
  width: number;
  height: number;
  /** 브라우저 캔버스 한계 때문에 요청보다 작아졌는지 */
  clamped: boolean;
  pxPerEm: number;
}

export function exportSize(wm: Wordmark, opt: Pick<ExportOptions, 'pxPerEm' | 'padEm'>): ExportSize {
  const wEm = wm.bbox.w / UNIT + opt.padEm * 2;
  const hEm = wm.bbox.h / UNIT + opt.padEm * 2;
  let ppe = opt.pxPerEm;
  let clamped = false;
  const limit = Math.min(MAX_SIDE / wEm, MAX_SIDE / hEm, Math.sqrt(MAX_AREA / (wEm * hEm)));
  if (ppe > limit) {
    ppe = limit;
    clamped = true;
  }
  return { width: Math.max(1, Math.round(wEm * ppe)), height: Math.max(1, Math.round(hEm * ppe)), clamped, pxPerEm: ppe };
}

function drawPath(ctx: CanvasRenderingContext2D, d: string, wm: Wordmark, color: string) {
  const path = new Path2D(d);
  if (wm.fill) {
    ctx.fillStyle = color;
    ctx.fill(path);
  }
  if (wm.strokeWidth > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = wm.strokeWidth;
    ctx.lineJoin = wm.linejoin === 'bevel' ? 'bevel' : wm.linejoin;
    ctx.miterLimit = wm.miterLimit;
    ctx.stroke(path);
  }
}

/** 투명 배경 캔버스에 워드마크를 그립니다. 배경은 칠하지 않습니다. */
export function renderToCanvas(wm: Wordmark, opt: ExportOptions): HTMLCanvasElement {
  const size = exportSize(wm, opt);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d')!;
  const k = size.pxPerEm / UNIT;
  const setup = (c: CanvasRenderingContext2D) => {
    c.setTransform(k, 0, 0, k, (-wm.bbox.x + opt.padEm * UNIT) * k, (-wm.bbox.y + opt.padEm * UNIT) * k);
  };
  const layer = () => {
    const c = document.createElement('canvas');
    c.width = size.width;
    c.height = size.height;
    return c;
  };
  const composite = (src: HTMLCanvasElement) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = wm.opacity;
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  };

  if (wm.knockout) {
    // 선을 그린 뒤 글자 안쪽을 지워 바깥 테두리만 남깁니다. (화면 미리보기의 mask와 같은 결과)
    const tmp = layer();
    const t = tmp.getContext('2d')!;
    setup(t);
    for (const d of wm.paths) drawPath(t, d, wm, opt.color);
    t.globalCompositeOperation = 'destination-out';
    t.fillStyle = '#000';
    for (const d of wm.paths) t.fill(new Path2D(d));
    composite(tmp);
  } else if (wm.opacity >= 1) {
    setup(ctx);
    for (const d of wm.paths) drawPath(ctx, d, wm, opt.color);
  } else {
    // SVG의 path별 opacity와 같은 결과가 되도록 글자마다 따로 그린 뒤 합성합니다.
    const tmp = layer();
    const t = tmp.getContext('2d')!;
    for (const d of wm.paths) {
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(0, 0, tmp.width, tmp.height);
      setup(t);
      drawPath(t, d, wm, opt.color);
      composite(tmp);
    }
  }
  return canvas;
}

export function exportPngBlob(wm: Wordmark, opt: ExportOptions): Promise<Blob> {
  const canvas = renderToCanvas(wm, opt);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG를 만들지 못했습니다.'))), 'image/png'),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
