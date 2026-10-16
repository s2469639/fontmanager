import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { analyzeText, MAX_CHARS } from '../core/text';
import { DIRECTIONS } from '../data/styles';
import { MiniWord } from '../components/MiniWord';
import type { Route } from '../state/router';

const EXAMPLES = ['고요', '다온', '모래', '한결', '바람결', '새벽빛'];

export function Start({ go }: { go: (r: Route) => void }) {
  const setText = useStore((s) => s.setText);
  const setExplore = useStore((s) => s.setExplore);
  const saved = useStore((s) => s.text);
  const [raw, setRaw] = useState(saved);
  const composing = useRef(false);

  const analysis = useMemo(() => analyzeText(raw), [raw]);
  const canGo = analysis.clean.length > 0;

  const submit = () => {
    if (!canGo) return;
    if (analysis.clean !== saved) setExplore(null, [], [], 1);
    setText(analysis.clean);
    go('explore');
  };

  return (
    <main className="screen start">
      <p className="eyebrow">STEP 01 — 브랜드명 입력</p>
      <h1 className="screen__title">디자인할 이름을 적어 주세요</h1>

      <div className="start__field">
        <input
          className="start__input"
          value={raw}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder="예) 고요"
          aria-label="브랜드명"
          onChange={(e) => setRaw(e.target.value)}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composing.current && !e.nativeEvent.isComposing) submit();
          }}
        />
        <span className="start__count">
          {Array.from(analysis.clean).length}/{MAX_CHARS}
        </span>
      </div>

      <div className="start__hints" aria-live="polite">
        {analysis.removed.length > 0 && (
          <p className="hint hint--warn">
            지원하지 않는 글자는 뺐어요: {analysis.removed.map((c) => `‘${c}’`).join(' ')}
          </p>
        )}
        {analysis.tooLong && <p className="hint hint--warn">{MAX_CHARS}자까지만 사용할 수 있어요.</p>}
        {!analysis.removed.length && !analysis.tooLong && (
          <p className="hint">한글, 영문, 숫자, 공백을 쓸 수 있어요. 최대 {MAX_CHARS}자.</p>
        )}
      </div>

      <div className="start__examples">
        <span className="start__examples-label">예시</span>
        {EXAMPLES.map((e) => (
          <button key={e} type="button" className="chip" onClick={() => setRaw(e)}>
            {e}
          </button>
        ))}
      </div>

      <div className="start__preview" aria-label="미리보기">
        {canGo ? (
          <MiniWord text={analysis.clean} params={DIRECTIONS[0].params} className="start__svg" />
        ) : (
          <p className="start__empty">이름을 입력하면 여기에 바로 나타납니다</p>
        )}
      </div>

      <div className="start__actions">
        <button className="btn btn--ghost" onClick={() => go('home')}>
          ← 처음으로
        </button>
        <button className="btn btn--primary btn--xl" disabled={!canGo} onClick={submit}>
          형태 탐색 시작 <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  );
}
