import type { JamoParams, Params } from './types';

export const DEFAULT_JAMO: JamoParams = {
  strokeW: 0.05,
  cap: 'round',
  roundness: 0.5,
  consonantScale: 1,
  vowelScale: 1,
  gap: 0,
  oShape: 'circle',
  circleGap: 0,
  bounce: 0,
};

export const DEFAULT_PARAMS: Params = {
  engine: 'font',
  jamo: DEFAULT_JAMO,
  glyphs: {},
  variants: {},
  fontId: 'pretendard',
  weight: 0.5,
  width: 100,
  tracking: 0,
  corner: 'sharp',
  cornerAmount: 0.5,
  skewOn: false,
  skew: 10,
  vScaleOn: false,
  vScale: 100,
  outlineOn: false,
  outlineWidth: 0.025,
  overlapOn: false,
  overlapAmount: 0.12,
  overlapOpacity: 0.7,
  color: 'auto',
};

/** 슬라이더와 변주 탐색이 공유하는 허용 범위 */
export const LIMITS = {
  weight: { min: 0, max: 1, step: 0.01 },
  strokeW: { min: 0.015, max: 0.13, step: 0.001 },
  roundness: { min: 0, max: 1, step: 0.01 },
  consonantScale: { min: 0.6, max: 1.25, step: 0.01 },
  vowelScale: { min: 0.6, max: 1.25, step: 0.01 },
  gap: { min: -8, max: 24, step: 0.5 },
  circleGap: { min: 0, max: 0.5, step: 0.01 },
  bounce: { min: 0, max: 0.14, step: 0.005 },
  width: { min: 50, max: 150, step: 1 },
  tracking: { min: -0.3, max: 0.8, step: 0.01 },
  cornerAmount: { min: 0.1, max: 1, step: 0.01 },
  skew: { min: -25, max: 25, step: 1 },
  vScale: { min: 50, max: 150, step: 1 },
  outlineWidth: { min: 0.008, max: 0.1, step: 0.002 },
  overlapAmount: { min: 0.02, max: 0.5, step: 0.01 },
  overlapOpacity: { min: 0.3, max: 1, step: 0.01 },
} as const;
