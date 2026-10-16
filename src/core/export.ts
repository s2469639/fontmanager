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

function drawPath(ctx: CanvasRenderingContext2D, d: string, wm: Wordmark, color: string, width: number) {
  const path = new Path2D(d);
  if (wm.fill) {
    ctx.fillStyle = color;
    ctx.fill(path);
  }
  if (width > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = wm.linecap;
    ctx.lineJoin = wm.linejoin;
    ctx.miterLimit = wm.miterLimit;
    ctx.stroke(path);
  }
}

/** 워드마크 하나를 투명 캔버스 한 장에 그립니다. (knockout, 겹침 투명도, 줄무늬를 모두 처리) */
function drawWordmarkLayer(
  wm: Wordmark,
  color: string,
  size: ExportSize,
  setup: (c: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const layer = () => {
    const c = document.createElement('canvas');
    c.width = size.width;
    c.height = size.height;
    return c;
  };
  const out = layer();
  const octx = out.getContext('2d')!;
  const composite = (src: HTMLCanvasElement, alpha: number) => {
    octx.save();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalAlpha = alpha;
    octx.drawImage(src, 0, 0);
    octx.restore();
  };
  const widthOf = (i: number) => wm.widths[i] ?? wm.strokeWidth;

  if (wm.knockout) {
    // 선을 그린 뒤 글자 안쪽을 지워 바깥 테두리만 남깁니다. (화면 미리보기의 mask와 같은 결과)
    const tmp = layer();
    const t = tmp.getContext('2d')!;
    setup(t);
    wm.paths.forEach((d, i) => drawPath(t, d, wm, color, widthOf(i)));
    t.globalCompositeOperation = 'destination-out';
    t.fillStyle = '#000';
    for (const d of wm.paths) t.fill(new Path2D(d));
    composite(tmp, wm.opacity);
  } else if (wm.opacity >= 1) {
    setup(octx);
    wm.paths.forEach((d, i) => drawPath(octx, d, wm, color, widthOf(i)));
  } else {
    // SVG의 path별 opacity와 같은 결과가 되도록 글자마다 따로 그린 뒤 합성합니다.
    const tmp = layer();
    const t = tmp.getContext('2d')!;
    wm.paths.forEach((d, i) => {
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(0, 0, tmp.width, tmp.height);
      setup(t);
      drawPath(t, d, wm, color, widthOf(i));
      composite(tmp, wm.opacity);
    });
  }

  if (wm.cuts.length) {
    // 줄무늬: 띠 모양으로 지웁니다.
    octx.save();
    setup(octx);
    octx.globalCompositeOperation = 'destination-out';
    octx.fillStyle = '#000';
    for (const poly of wm.cuts) {
      octx.beginPath();
      poly.forEach(([x, y], i) => (i === 0 ? octx.moveTo(x, y) : octx.lineTo(x, y)));
      octx.closePath();
      octx.fill();
    }
    octx.restore();
  }
  return out;
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
  ctx.drawImage(drawWordmarkLayer(wm, opt.color, size, setup), 0, 0);
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
