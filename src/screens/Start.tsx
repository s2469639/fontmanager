import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { analyzeText, MAX_CHARS } from '../core/text';
import { directionOf } from '../data/styles';
import { MiniWord } from '../components/MiniWord';
import type { Route } from '../state/router';
import { openProjectFile } from '../state/projectIO';
import { ProjectError } from '../core/project';

const EXAMPLES = ['고요', '다온', '모래', '한결', '바람결', '새벽빛'];

export function Start({ go }: { go: (r: Route) => void }) {
  const setText = useStore((s) => s.setText);
  const setExplore = useStore((s) => s.setExplore);
  const saved = useStore((s) => s.text);
  const [raw, setRaw] = useState(saved);
  const composing = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);

  const openFile = async (file: File) => {
    setLoadMsg(null);
    try {
      await openProjectFile(file);
      go('edit');
    } catch (e) {
      setLoadMsg(e instanceof ProjectError ? e.message : '파일을 열지 못했어요.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

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
          <MiniWord
            text={analysis.clean}
            params={directionOf(/^[가-힣ㄱ-ㅎㅏ-ㅣ ]+$/.test(analysis.clean) ? 'linear' : 'geometric').params}
            className="start__svg"
          />
        ) : (
          <p className="start__empty">이름을 입력하면 여기에 바로 나타납니다</p>
        )}
      </div>

      {loadMsg && (
        <p className="hint hint--warn" role="alert" style={{ marginTop: 12 }}>
          {loadMsg}
        </p>
      )}
      <div className="start__actions">
        <div className="start__left">
          <button className="btn btn--ghost" onClick={() => go('home')}>
            ← 처음으로
          </button>
          <button className="btn btn--soft" onClick={() => fileInput.current?.click()}>
            저장한 작업 열기
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])}
          />
        </div>
        <button className="btn btn--primary btn--xl" disabled={!canGo} onClick={submit}>
          형태 탐색 시작 <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  );
}
