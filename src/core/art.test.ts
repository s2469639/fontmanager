import { describe, expect, it } from 'vitest';
import { artCorners, artHeight, contentBox } from './art';
import type { ArtLayer } from './art';

const layer = (p: Partial<ArtLayer> = {}): ArtLayer => ({
  id: 'a', name: 'a.png', src: 'blob:x', natW: 200, natH: 100,
  ox: 0, oy: 0, width: 1000, rot: 0, opacity: 1, flipX: false, front: false, ...p,
});

describe('art', () => {
  it('세로 길이는 원본 비율을 따른다', () => {
    expect(artHeight(layer())).toBe(500);
  });
  it('회전하지 않으면 꼭짓점이 사각형이다', () => {
    const c = artCorners(layer(), [0, 0]);
    expect(c[0]).toEqual([-500, -250]);
    expect(c[2]).toEqual([500, 250]);
  });
  it('워드마크와 그림을 모두 감싸는 범위를 구한다', () => {
    const wm = { x: 0, y: 0, w: 400, h: 200 };
    const box = contentBox(wm, [layer({ width: 2000 })]); // 중심(200,100)에 폭 2000, 높이 1000
    expect(box.x).toBeCloseTo(-800);
    expect(box.w).toBeCloseTo(2000);
    expect(box.h).toBeCloseTo(1000);
  });
  it('그림이 없으면 워드마크 범위 그대로', () => {
    const wm = { x: 5, y: 6, w: 7, h: 8 };
    expect(contentBox(wm, [])).toEqual(wm);
  });
  it('90도 회전하면 가로세로가 바뀐다', () => {
    const wm = { x: 0, y: 0, w: 10, h: 10 };
    const box = contentBox(wm, [layer({ rot: 90 })]);
    expect(box.w).toBeCloseTo(500);
    expect(box.h).toBeCloseTo(1000);
  });
});
