import type { Params } from '../core/types';
import { useWordmark } from '../state/useWordmark';
import { WordmarkSVG } from './WordmarkSVG';
import { resolveColor } from '../core/color';

interface Props {
  text: string;
  params: Params;
  bg?: 'light' | 'dark';
  pad?: number;
  className?: string;
}

/** 글꼴을 불러오는 동안은 빈 자리를 유지하는 작은 워드마크 */
export function MiniWord({ text, params, bg = 'light', pad = 0.08, className }: Props) {
  const { wordmark } = useWordmark(text, params);
  if (!wordmark) return <span className={`miniword__wait ${className ?? ''}`} aria-hidden="true" />;
  return (
    <WordmarkSVG
      layers={[{ wordmark, color: resolveColor(params.color, bg, params.plate) }]}
      pad={pad}
      label={text}
      className={className}
    />
  );
}
