import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Params } from '../core/types';
import { sanitizeParams } from '../core/project';
import { analyzeText } from '../core/text';

export interface Preset {
  id: string;
  name: string;
  /** 저장할 때의 이름(글자). 미리보기와 '열기'에 쓰입니다. */
  text: string;
  params: Params;
  savedAt: string;
}

export const MAX_PRESETS = 30;
export const MAX_NAME = 30;

interface PresetState {
  presets: Preset[];
  /** 같은 이름이 있으면 덮어쓰고 true를 돌려줍니다. */
  save: (name: string, text: string, params: Params) => { replaced: boolean };
  remove: (id: string) => void;
}

export const usePresets = create<PresetState>()(
  persist(
    (set, get) => ({
      presets: [],
      save: (rawName, text, params) => {
        const name = rawName.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || '이름 없는 프리셋';
        const existing = get().presets.find((p) => p.name === name);
        const entry: Preset = {
          id: existing?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          name,
          text,
          params,
          savedAt: new Date().toISOString(),
        };
        set((s) => ({
          presets: existing
            ? s.presets.map((p) => (p.id === existing.id ? entry : p))
            : [entry, ...s.presets].slice(0, MAX_PRESETS),
        }));
        return { replaced: !!existing };
      },
      remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
    }),
    {
      name: 'hangul-form-lab:presets:v1',
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
      }),
      partialize: (s) => ({ presets: s.presets }),
      // 저장된 값이 깨져 있거나 예전 버전이어도 앱이 멈추지 않도록 불러올 때 다시 검사합니다.
      merge: (persisted, current) => {
        const list = (persisted as { presets?: unknown } | undefined)?.presets;
        const presets: Preset[] = [];
        if (Array.isArray(list)) {
          for (const raw of list.slice(0, MAX_PRESETS)) {
            if (!raw || typeof raw !== 'object') continue;
            const r = raw as Record<string, unknown>;
            const text = analyzeText(typeof r.text === 'string' ? r.text : '').clean;
            if (!text || typeof r.id !== 'string' || typeof r.name !== 'string') continue;
            presets.push({
              id: r.id.slice(0, 40),
              name: r.name.slice(0, MAX_NAME),
              text,
              params: sanitizeParams(r.params),
              savedAt: typeof r.savedAt === 'string' ? r.savedAt : '',
            });
          }
        }
        return { ...current, presets };
      },
    },
  ),
);
