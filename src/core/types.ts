export type Corner = 'sharp' | 'round' | 'bevel';

export type Cap = 'round' | 'butt' | 'square';
export type OShape = 'circle' | 'square' | 'diamond';
/** 획 연결 방식: snap은 자소를 움직여 붙이고, bridge는 직선으로, curve는 곡선으로 잇습니다. */
export type LinkMode = 'snap' | 'bridge' | 'curve';
/** font: 글꼴 윤곽선 기반 / jamo: 자음·모음을 선으로 직접 조립(프로토타입) */
export type Engine = 'font' | 'jamo';

/** 자소 조립(선형) 모드의 조형 값 */
export interface JamoParams {
  /** 선 굵기(em) */
  strokeW: number;
  cap: Cap;
  /** 꺾이는 곳을 둥글리는 정도 0..1 */
  roundness: number;
  /** 초성 크기 배율 */
  consonantScale: number;
  /** 모음 크기 배율 */
  vowelScale: number;
  /** 초성과 모음 사이 간격(설계 단위) */
  gap: number;
  oShape: OShape;
  /** ㅇ(ㅎ의 고리 포함)을 여는 정도 0..0.5 */
  circleGap: number;
  /** 글자마다 위아래로 어긋나는 정도(em) */
  bounce: number;
  /** 획 연결: 이 거리 안의 인접한 자소를 이어 줍니다. 0이면 끔 (0..1) */
  link: number;
  linkMode: LinkMode;
}

/** 한 글자 안의 초성/모음/받침 하나를 따로 조절하는 값 */
export interface PartAdjust {
  /** 크기 배율 */
  scale: number;
  /** 가로·세로 이동(설계 단위, 한 칸=100) */
  dx: number;
  dy: number;
  /** 회전(도) */
  rot: number;
}

/** 한 글자만 따로 바꾸는 값. 지정하지 않은 항목은 전체 설정을 따릅니다. */
export interface GlyphOverride {
  L?: Partial<PartAdjust>;
  V?: Partial<PartAdjust>;
  T?: Partial<PartAdjust>;
  oShape?: OShape;
  circleGap?: number;
  /** 이 글자의 선 굵기 배율 */
  stroke?: number;
  /** 이 글자의 획 연결 정도 (0이면 이 글자만 끔) */
  link?: number;
  /** 이 글자의 초성/모음/받침 뼈대 모양 번호 (전체 설정보다 우선) */
  Lv?: number;
  Vv?: number;
  Tv?: number;
}

export type WaveAxis = 'y' | 'x' | 'both';
export type BulgeScope = 'glyph' | 'word';

/** 형태 변형 효과: 거칠게 · 물결 · 부풀림 · 줄무늬 */
export interface FxParams {
  roughOn: boolean;
  /** 윤곽이 흔들리는 크기(em) */
  roughAmp: number;
  /** 흔들림 한 덩어리의 크기(em). 작을수록 잔잔하게 떨림 */
  roughScale: number;
  roughSeed: number;

  waveOn: boolean;
  waveAmp: number;
  /** 물결 한 주기의 길이(em) */
  waveLen: number;
  wavePhase: number;
  waveAxis: WaveAxis;

  bulgeOn: boolean;
  /** 양수는 부풀림, 음수는 오므림 */
  bulgeAmount: number;
  /** glyph: 글자마다, word: 단어 전체를 한 덩어리로 */
  bulgeScope: BulgeScope;

  stripeOn: boolean;
  /** 띠가 뻗는 각도(도). 0이면 가로줄 */
  stripeAngle: number;
  stripeCount: number;
  /** 한 줄 중 잘려 나가는 비율 */
  stripeGap: number;
  stripePhase: number;
}

/** 워드마크의 모든 조형 값. UI와 렌더링 엔진이 공유하는 유일한 상태 형태입니다. */
export interface Params {
  engine: Engine;
  jamo: JamoParams;
  /** 자소 조립 모드에서 글자별로 바꾼 값. 키는 그려진 글자의 순서(0부터) */
  glyphs: Record<number, GlyphOverride>;
  fx: FxParams;
  /** 자모별 뼈대 모양 번호 (예: ㄱ → 2). 지정하지 않으면 0번 */
  variants: Record<string, number>;
  fontId: string;
  /** 0..1. 가변 글꼴은 wght 축, 고정 글꼴은 외곽선 보정(근사)으로 해석됩니다. */
  weight: number;
  /** 가로 비율(%). 글꼴의 wdth 축이 아니라 가로 스케일입니다. */
  width: number;
  /** 자간(em). */
  tracking: number;
  corner: Corner;
  /** 0..1 */
  cornerAmount: number;

  skewOn: boolean;
  /** 도 */
  skew: number;

  vScaleOn: boolean;
  /** 세로 비율(%) */
  vScale: number;

  outlineOn: boolean;
  /** em */
  outlineWidth: number;

  overlapOn: boolean;
  /** 추가로 겹치는 정도(em) */
  overlapAmount: number;
  /** 겹침 효과의 글자 불투명도 */
  overlapOpacity: number;

  /** 'auto'는 배경에 맞춰 검정/흰색 */
  color: string;
}

export type WeightMode =
  | { kind: 'axis'; min: number; max: number }
  | { kind: 'stroke'; maxEm: number };

export interface FontDef {
  id: string;
  name: string;
  nameKo: string;
  file: string;
  /** 한 줄 설명 (UI에 표시) */
  vibe: string;
  weight: WeightMode;
  license: 'OFL-1.1';
  licenseFile: string;
  copyright: string;
  source: string;
  /** 이 파일이 지원하는 글자 범위에 대한 안내 */
  coverageNote: string;
}

/** 폰트 단위 1000 = 1em, y축은 위가 +(글꼴 좌표계) */
export type Cmd =
  | ['M', number, number]
  | ['L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

export interface GlyphShape {
  char: string;
  cmds: Cmd[];
  advance: number;
  fromFallback: boolean;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Wordmark {
  /** 최종 좌표(1em = 1000, y는 SVG 방향)로 변환된 글자별 경로 */
  paths: string[];
  bbox: BBox;
  fill: boolean;
  /** 외곽선만 보기: 선을 그린 뒤 글자 안쪽을 지워 바깥 테두리만 남깁니다(겹친 획의 안쪽 선이 보이지 않음) */
  knockout: boolean;
  /** 실제로 그리는 선 두께 (knockout이면 보이는 두께의 2배) */
  strokeWidth: number;
  /** paths와 같은 순서의 선 두께 (글자별로 다를 수 있음) */
  widths: number[];
  /** paths와 같은 순서의 글자 영역 (선택·클릭용) */
  boxes: BBox[];
  /** 줄무늬 효과로 지울 띠(사각형 꼭짓점 4개씩). 없으면 빈 배열 */
  cuts: [number, number][][];
  linejoin: 'miter' | 'round' | 'bevel';
  linecap: Cap;
  miterLimit: number;
  opacity: number;
  /** 선택한 글꼴이 지원하지 않아 대체 글꼴로 그린 글자 */
  fallbackChars: string[];
  /** 어느 글꼴에도 없어 그리지 못한 글자 */
  missingChars: string[];
}

export const UNIT = 1000;
