import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useWordmark } from '../state/useWordmark';
import { WordmarkSVG } from '../components/WordmarkSVG';
import type { Layer } from '../components/WordmarkSVG';
import { ControlPanel } from '../components/ControlPanel';
import { ArtPanel } from '../components/ArtPanel';
import { PresetPanel } from '../components/PresetPanel';
import { Segmented } from '../components/Controls';
import { BG, resolveColor } from '../core/color';
import { DEFAULT_PARAMS } from '../core/defaults';
import type { Route } from '../state/router';

type Compare = 'current' | 'baseline' | 'overlay';

export function Edit({ go }: { go: (r: Route) => void }) {
  const text = useStore((s) => s.text);
  const params = useStore((s) => s.params);
  const baseline = useStore((s) => s.baseline) ?? DEFAULT_PARAMS;
  const baselineLabel = useStore((s) => s.baselineLabel);
  const bg = useStore((s) => s.bg);
  const selectedGlyph = useStore((s) => s.selectedGlyph);
  const selectGlyph = useStore((s) => s.selectGlyph);
  const art = useStore((s) => s.art);
  const selectedArt = useStore((s) => s.selectedArt);
  const selectArt = useStore((s) => s.selectArt);
  const updateArt = useStore((s) => s.updateArt);
  const setBg = useStore((s) => s.setBg);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { undo, redo, reset } = useStore.getState();

  const [compare, setCompare] = useState<Compare>('current');
  const [guides, setGuides] = useState(false);

  const cur = useWordmark(text, params);
  const base = useWordmark(text, baseline);

  const layers: Layer[] = useMemo(() => {
    const out: Layer[] = [];
    const baseColor = resolveColor(baseline.color, bg);
    const curColor = resolveColor(params.color, bg);
    if (compare === 'baseline') {
      if (base.wordmark) out.push({ wordmark: base.wordmark, color: baseColor });
    } else if (compare === 'overlay') {
      if (cur.wordmark) out.push({ wordmark: cur.wordmark, color: curColor });
      if (base.wordmark) out.push({ wordmark: base.wordmark, color: baseColor, ghost: true });
    } else if (cur.wordmark) {
      out.push({ wordmark: cur.wordmark, color: curColor });
    }
    return out;
  }, [compare, cur.wordmark, base.wordmark, params.color, baseline.color, bg]);

  const fb = cur.wordmark?.fallbackChars ?? [];
  const missing = cur.wordmark?.missingChars ?? [];
  const stageLabel =
    compare === 'baseline'
      ? `처음 시안 · ${baselineLabel || '시안'}`
      : compare === 'overlay'
        ? '현재 결과 위에 처음 시안의 윤곽(점선)을 겹쳐 보는 중'
        : '현재 편집 결과';

  return (
    <main className="editor">
      <div className="editor__bar">
        <div className="editor__bar-group">
          <button className="btn btn--ghost" onClick={() => go('explore')}>
            ← 탐색
          </button>
          <button className="btn btn--ghost" disabled={!canUndo} onClick={undo} aria-label="되돌리기">
            ↶ 되돌리기
          </button>
          <button className="btn btn--ghost" disabled={!canRedo} onClick={redo} aria-label="다시 실행">
            ↷ 다시
          </button>
          <button className="btn btn--ghost" onClick={reset} disabled={!useStore.getState().baseline}>
            초기화
          </button>
        </div>
        <div className="editor__bar-group">
          <Segmented<Compare>
            label="비교"
            value={compare}
            options={[
              { value: 'current', label: '현재' },
              { value: 'baseline', label: '처음 시안' },
              { value: 'overlay', label: '겹쳐 보기' },
            ]}
            onChange={setCompare}
          />
          <Segmented<'light' | 'dark'>
            label="배경"
            value={bg}
            options={[
              { value: 'light', label: '밝은 배경' },
              { value: 'dark', label: '어두운 배경' },
            ]}
            onChange={setBg}
          />
          <button
            className={guides ? 'btn btn--soft is-on' : 'btn btn--ghost'}
            aria-pressed={guides}
            onClick={() => setGuides((g) => !g)}
          >
            가이드
          </button>
        </div>
        <button className="btn btn--primary" onClick={() => go('result')}>
          결과 확인 →
        </button>
      </div>

      <div className="editor__body">
        <section className="stage" style={{ background: BG[bg] }} aria-label="미리보기">
          {layers.length > 0 ? (
            <WordmarkSVG
              layers={layers}
              pad={0.35}
              guides={guides}
              art={art}
              artEdit={
                art.length
                  ? { selectedId: selectedArt, onSelect: selectArt, onMove: (id, ox, oy) => updateArt(id, { ox, oy }) }
                  : undefined
              }
              selectable={
                params.engine === 'jamo' && compare === 'current' && !selectedArt
                  ? { selected: selectedGlyph, onSelect: (i) => selectGlyph(selectedGlyph === i ? null : i) }
                  : undefined
              }
              label={text}
              className="stage__svg"
            />
          ) : (
            <p className="stage__wait">{cur.error ? '글꼴을 불러오지 못했어요.' : '글꼴 불러오는 중…'}</p>
          )}
          <p className={bg === 'dark' ? 'stage__caption is-dark' : 'stage__caption'}>{stageLabel}</p>
          {(fb.length > 0 || missing.length > 0) && (
            <p className="stage__notice">
              {fb.length > 0 && <>‘{fb.join('')}’은(는) 이 글꼴에 없어 대체 글꼴로 그렸어요. </>}
              {missing.length > 0 && <>‘{missing.join('')}’은(는) 표시할 수 없어 뺐어요.</>}
            </p>
          )}
        </section>
        <aside className="editor__panel">
          <PresetPanel />
          <ControlPanel />
          <ArtPanel wm={cur.wordmark} />
        </aside>
      </div>
    </main>
  );
}
