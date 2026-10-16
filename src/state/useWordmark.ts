import { useEffect, useMemo, useRef, useState } from 'react';
import type { Params, Wordmark } from '../core/types';
import { buildWordmark } from '../core/geometry';
import { isFontLoaded, loadFont } from '../core/fontStore';
import { FALLBACK_FONT_ID } from '../data/fonts';

/**
 * 텍스트와 파라미터로 워드마크 형상을 계산합니다.
 * 글꼴이 로드되는 동안에는 직전 형상을 유지해 화면이 깜빡이지 않게 합니다.
 */
export function useWordmark(text: string, params: Params): { wordmark: Wordmark | null; loading: boolean; error: boolean } {
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(false);
  const last = useRef<Wordmark | null>(null);

  useEffect(() => {
    if (params.engine === 'jamo') return;
    let alive = true;
    setError(false);
    loadFont(params.fontId)
      .then(() => alive && setTick((t) => t + 1))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [params.fontId, params.engine]);

  const built = useMemo(
    () => buildWordmark(text, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, params, tick],
  );

  // 선택한 글꼴에 없는 글자가 있으면 그때서야 대체 글꼴을 불러옵니다.
  useEffect(() => {
    if (params.engine === 'font' && built === null && isFontLoaded(params.fontId) && !isFontLoaded(FALLBACK_FONT_ID)) {
      let alive = true;
      loadFont(FALLBACK_FONT_ID)
        .then(() => alive && setTick((t) => t + 1))
        .catch(() => alive && setError(true));
      return () => {
        alive = false;
      };
    }
  }, [built, params.fontId]);

  if (built) last.current = built;
  return { wordmark: built ?? last.current, loading: built === null, error };
}
