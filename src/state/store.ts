import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Params } from '../core/types';
import { disposeArt } from '../core/art';
import type { ArtLayer } from '../core/art';
import { DEFAULT_FX, DEFAULT_JAMO, DEFAULT_PARAMS } from '../core/defaults';

export interface TrailItem {
  label: string;
  params: Params;
}

interface State {
  text: string;
  /** 편집을 시작한 시안(비교 기준). null이면 아직 시안을 고르지 않음 */
  baseline: Params | null;
  baselineLabel: string;
  params: Params;
  past: Params[];
  future: Params[];
  lastChangeAt: number;
  bg: 'light' | 'dark';
  /** 글자별 편집에서 선택한 글자(그려진 순서). 저장하지 않습니다. */
  selectedGlyph: number | null;

  /** 첨부한 그림. 파일 자체는 저장하지 않으므로 새로고침하면 사라집니다. */
  art: ArtLayer[];
  selectedArt: string | null;

  /** 형태 탐색 갤러리 상태 */
  exploreCenter: Params | null;
  exploreSiblings: string[];
  exploreSeed: number;
  trail: TrailItem[];

  setText: (t: string) => void;
  setBg: (b: 'light' | 'dark') => void;
  selectGlyph: (i: number | null) => void;
  addArt: (layer: ArtLayer) => void;
  updateArt: (id: string, patch: Partial<ArtLayer>) => void;
  removeArt: (id: string) => void;
  selectArt: (id: string | null) => void;
  /** 시안을 골라 편집을 시작합니다. 되돌리기 기록과 비교 기준이 새로 만들어집니다. */
  startEditing: (params: Params, label: string) => void;
  setParams: (patch: Partial<Params>) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;

  setExplore: (center: Params | null, siblings: string[], trail: TrailItem[], seed: number) => void;
}

const COALESCE_MS = 700;

/** 저장된 값에 새 필드가 없어도 기본값으로 채웁니다. */
function fillParams(p?: Partial<Params>): Params {
  return {
    ...DEFAULT_PARAMS,
    ...(p ?? {}),
    jamo: { ...DEFAULT_JAMO, ...(p?.jamo ?? {}) },
    glyphs: { ...(p?.glyphs ?? {}) },
    variants: { ...(p?.variants ?? {}) },
    fx: { ...DEFAULT_FX, ...(p?.fx ?? {}) },
  };
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      text: '',
      baseline: null,
      baselineLabel: '',
      params: DEFAULT_PARAMS,
      past: [],
      future: [],
      lastChangeAt: 0,
      bg: 'light',
      selectedGlyph: null,
      art: [],
      selectedArt: null,
      exploreCenter: null,
      exploreSiblings: [],
      exploreSeed: 1,
      trail: [],

      setText: (text) => set({ text }),
      setBg: (bg) => set({ bg }),
      selectGlyph: (selectedGlyph) => set({ selectedGlyph }),
      addArt: (layer) => set((s) => ({ art: [...s.art, layer], selectedArt: layer.id, selectedGlyph: null })),
      updateArt: (id, patch) => set((s) => ({ art: s.art.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      removeArt: (id) =>
        set((s) => {
          const gone = s.art.find((l) => l.id === id);
          if (gone) disposeArt(gone);
          return { art: s.art.filter((l) => l.id !== id), selectedArt: s.selectedArt === id ? null : s.selectedArt };
        }),
      selectArt: (selectedArt) => set((s) => ({ selectedArt, selectedGlyph: selectedArt ? null : s.selectedGlyph })),

      startEditing: (params, label) =>
        set({ params, baseline: params, baselineLabel: label, past: [], future: [], lastChangeAt: 0, selectedGlyph: null }),

      setParams: (patch) => {
        const s = get();
        const now = Date.now();
        // 슬라이더를 끌고 있는 동안은 되돌리기 기록을 하나로 합칩니다.
        const coalesce = now - s.lastChangeAt < COALESCE_MS && s.past.length > 0;
        set({
          params: { ...s.params, ...patch },
          past: coalesce ? s.past : [...s.past, s.params].slice(-100),
          future: [],
          lastChangeAt: now,
        });
      },

      undo: () => {
        const s = get();
        if (!s.past.length) return;
        const prev = s.past[s.past.length - 1];
        set({ params: prev, past: s.past.slice(0, -1), future: [s.params, ...s.future], lastChangeAt: 0 });
      },
      redo: () => {
        const s = get();
        if (!s.future.length) return;
        const [next, ...rest] = s.future;
        set({ params: next, past: [...s.past, s.params], future: rest, lastChangeAt: 0 });
      },
      reset: () => {
        const s = get();
        if (!s.baseline) return;
        set({ params: s.baseline, past: [...s.past, s.params], future: [], lastChangeAt: 0 });
      },

      setExplore: (exploreCenter, exploreSiblings, trail, exploreSeed) =>
        set({ exploreCenter, exploreSiblings, trail, exploreSeed }),
    }),
    {
      name: 'hangul-form-lab:v1',
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
      }),
      partialize: (s) => ({
        text: s.text,
        baseline: s.baseline,
        baselineLabel: s.baselineLabel,
        params: s.params,
        bg: s.bg,
      }),
      // 저장된 값에 새 필드가 없을 수 있어 기본값 위에 덮어씁니다.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          params: fillParams(p.params),
          baseline: p.baseline ? fillParams(p.baseline) : null,
        };
      },
    },
  ),
);
