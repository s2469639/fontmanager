import type { Params } from '../core/types';
import { DEFAULT_PARAMS } from '../core/defaults';

export interface Direction {
  id: string;
  index: string;
  nameKo: string;
  nameEn: string;
  note: string;
  params: Params;
  /** 변주 탐색에서 글꼴을 바꿀 때 고르는 같은 계열의 글꼴 */
  siblings: string[];
}

const base = (p: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, ...p });

export const DIRECTIONS: Direction[] = [
  {
    id: 'geometric',
    index: '01',
    nameKo: '기하학적',
    nameEn: 'Geometric',
    note: '고른 굵기와 정돈된 간격. 중립적인 구조 위에서 시작합니다.',
    params: base({ fontId: 'pretendard', weight: 0.62, width: 100, tracking: 0.02 }),
    siblings: ['pretendard', 'ibm-plex-sans-kr', 'noto-sans-kr'],
  },
  {
    id: 'soft',
    index: '02',
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
    index: '03',
    nameKo: '각진',
    nameEn: 'Angular',
    note: '단단한 면과 바짝 붙은 간격. 묵직하고 날이 선 인상입니다.',
    params: base({ fontId: 'black-han-sans', weight: 0, tracking: -0.04, corner: 'sharp' }),
    siblings: ['black-han-sans', 'noto-serif-kr', 'ibm-plex-sans-kr'],
  },
  {
    id: 'condensed',
    index: '04',
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

export function directionOf(id: string) {
  return DIRECTIONS.find((d) => d.id === id) ?? DIRECTIONS[0];
}
