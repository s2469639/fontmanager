import type { Params } from '../core/types';
import { DEFAULT_JAMO, DEFAULT_PARAMS } from '../core/defaults';

export interface Direction {
  id: string;
  index: string;
  nameKo: string;
  nameEn: string;
  note: string;
  params: Params;
  /** 변주 탐색에서 글꼴을 바꿀 때 고르는 같은 계열의 글꼴 */
  siblings: string[];
  /** 자소 조립 엔진을 쓰는 실험 방향 */
  experimental?: boolean;
}

const base = (p: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, ...p });
const jamo = (j: Partial<Params['jamo']>, p: Partial<Params> = {}): Params =>
  base({ engine: 'jamo', jamo: { ...DEFAULT_JAMO, ...j }, ...p });

const JAMO_DIRECTIONS: Direction[] = [
  {
    id: 'linear',
    index: '01',
    nameKo: '선형',
    nameEn: 'Linear',
    note: '자음·모음을 가는 선으로 직접 조립하고 가까운 획을 이었어요. 끝이 둥글고 가볍습니다.',
    params: jamo({ strokeW: 0.045, cap: 'round', roundness: 0.6, link: 0.45, linkMode: 'bridge' }, { tracking: 0.03 }),
    siblings: [],
    experimental: true,
  },
  {
    id: 'modular',
    index: '02',
    nameKo: '모듈',
    nameEn: 'Modular',
    note: 'ㅇ이 네모가 되고 선 끝이 반듯합니다. 블록을 쌓은 듯한 구성이에요.',
    params: jamo(
      { strokeW: 0.075, cap: 'square', roundness: 0, oShape: 'square', gap: 3, consonantScale: 0.96 },
      { tracking: 0.02 },
    ),
    siblings: [],
    experimental: true,
  },
  {
    id: 'serif',
    index: '00',
    nameKo: '부리',
    nameEn: 'Serif',
    note: '명조처럼 가로획은 가늘고 세로획은 굵게, 획 끝에는 삼각형 부리를 달았어요.',
    params: jamo(
      { strokeW: 0.052, contrast: 0.75, cap: 'butt', roundness: 0, hookStart: 0.7, hookEnd: 0.35, hookStyle: 'tick', gap: 4 },
      { tracking: 0.04 },
    ),
    siblings: [],
    experimental: true,
  },
  {
    id: 'open',
    index: '03',
    nameKo: '열린',
    nameEn: 'Open',
    note: '고리가 열리고 획이 펜을 떼지 않은 듯 한 줄로 이어지며 글자가 위아래로 어긋납니다.',
    params: jamo(
      { strokeW: 0.032, cap: 'round', roundness: 0.8, circleGap: 0.14, bounce: 0.04, gap: 6, vowelScale: 1.08, link: 0.8, linkMode: 'flow' },
      { tracking: 0.06, variants: { ㄱ: 2, ㄴ: 2, ㅅ: 2 } },
    ),
    siblings: [],
    experimental: true,
  },
];

const FONT_DIRECTIONS: Direction[] = [
  {
    id: 'geometric',
    index: '04',
    nameKo: '기하학적',
    nameEn: 'Geometric',
    note: '고른 굵기와 정돈된 간격. 중립적인 구조 위에서 시작합니다.',
    params: base({ fontId: 'pretendard', weight: 0.62, width: 100, tracking: 0.02 }),
    siblings: ['pretendard', 'ibm-plex-sans-kr', 'noto-sans-kr'],
  },
  {
    id: 'soft',
    index: '05',
    nameKo: '부드러운',
    nameEn: 'Soft',
    note: '둥근 모서리와 넉넉한 간격. 말랑한 인상을 만듭니다.',
    params: base({
      fontId: 'jua',
      weight: 0.1,
      tracking: 0.05,
      corner: 'round',
      cornerAmount: 0.6,
    }),
    siblings: ['jua', 'gowun-batang', 'pretendard'],
  },
  {
    id: 'angular',
    index: '06',
    nameKo: '각진',
    nameEn: 'Angular',
    note: '단단한 면과 바짝 붙은 간격. 묵직하고 날이 선 인상입니다.',
    params: base({ fontId: 'black-han-sans', weight: 0, tracking: -0.04, corner: 'sharp' }),
    siblings: ['black-han-sans', 'noto-serif-kr', 'ibm-plex-sans-kr'],
  },
  {
    id: 'condensed',
    index: '07',
    nameKo: '응축된',
    nameEn: 'Condensed',
    note: '좁고 높게 눌린 비율. 밀도가 높은 글자 덩어리를 만듭니다.',
    params: base({
      fontId: 'do-hyeon',
      weight: 0.1,
      width: 68,
      tracking: -0.02,
      vScaleOn: true,
      vScale: 112,
    }),
    siblings: ['do-hyeon', 'pretendard', 'noto-sans-kr'],
  },
];

export const DIRECTIONS: Direction[] = [...JAMO_DIRECTIONS, ...FONT_DIRECTIONS].map((d, i) => ({
  ...d,
  index: String(i + 1).padStart(2, '0'),
}));

export function directionOf(id: string) {
  return DIRECTIONS.find((d) => d.id === id) ?? DIRECTIONS[0];
}
