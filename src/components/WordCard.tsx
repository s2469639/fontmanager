import type { ReactNode } from 'react';
import type { Params } from '../core/types';
import { useWordmark } from '../state/useWordmark';
import { WordmarkSVG } from './WordmarkSVG';
import { resolveColor } from '../core/color';
import { getFont } from '../data/fonts';

interface Props {
  text: string;
  params: Params;
  index: string;
  title: string;
  tags?: string[];
  pinned?: boolean;
  actions: ReactNode;
}

export function WordCard({ text, params, index, title, tags, pinned, actions }: Props) {
  const { wordmark, loading, error } = useWordmark(text, params);
  const fb = wordmark?.fallbackChars ?? [];
  return (
    <article className={pinned ? 'card is-pinned' : 'card'}>
      <div className="card__stage">
        <span className="card__index">{index}</span>
        {pinned && <span className="card__badge">기준 시안</span>}
        {wordmark ? (
          <WordmarkSVG
            layers={[{ wordmark, color: resolveColor(params.color, 'light') }]}
            pad={0.1}
            label={`${text} — ${title}`}
            className={loading ? 'card__svg is-loading' : 'card__svg'}
          />
        ) : (
          <span className="card__wait">{error ? '글꼴을 불러오지 못했어요' : '글꼴 불러오는 중…'}</span>
        )}
      </div>
      <div className="card__meta">
        <h3 className="card__title">{title}</h3>
        {tags && (
          <ul className="card__tags">
            {tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <p className="card__font">{getFont(params.fontId).nameKo}</p>
        {fb.length > 0 && (
          <p className="card__note">
            ‘{fb.join('')}’ 은(는) 이 글꼴에 없어 {getFont('pretendard').nameKo}로 대체했어요
          </p>
        )}
      </div>
      <div className="card__actions">{actions}</div>
    </article>
  );
}
