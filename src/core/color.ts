export const INK = '#111111';
export const PAPER = '#f2efe8';

/** 글자색. 'auto'는 배경에, 배경 판이 켜져 있으면 판과 더 대비되는 색(흰색/검정)에 맞춥니다. */
export function resolveColor(color: string, bg: 'light' | 'dark', plate?: { on: boolean; color: string }): string {
  if (color !== 'auto') return color;
  if (plate?.on) return contrast('#ffffff', plate.color) >= contrast(INK, plate.color) ? '#ffffff' : INK;
  return bg === 'light' ? INK : PAPER;
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 대비비 (1~21) */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const BG = { light: '#f7f5f0', dark: '#0f0f10' } as const;
