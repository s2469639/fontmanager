import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useWordmark } from '../state/useWordmark';
import { WordmarkSVG } from '../components/WordmarkSVG';
import { Segmented } from '../components/Controls';
import { BG, contrast, resolveColor } from '../core/color';
import { downloadBlob, exportPngBlob, exportSize, renderToCanvas } from '../core/export';
import type { Route } from '../state/router';

const SIZES = [
  { value: '200', label: '작게' },
  { value: '400', label: '보통' },
  { value: '800', label: '크게' },
] as const;
const PADS = [
  { value: '0.1', label: '좁게' },
  { value: '0.25', label: '보통' },
  { value: '0.5', label: '넓게' },
] as const;

export function Result({ go }: { go: (r: Route) => void }) {
  const text = useStore((s) => s.text);
  const params = useStore((s) => s.params);
  const { wordmark } = useWordmark(text, params);

  const [size, setSize] = useState<string>('400');
  const [pad, setPad] = useState<string>('0.25');
  const [colorMode, setColorMode] = useState<'current' | 'black' | 'white'>(
    params.color === 'auto' ? 'black' : 'current',
  );
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const exportColor =
    colorMode === 'current' && params.color !== 'auto' ? params.color : colorMode === 'white' ? '#ffffff' : '#111111';

  const opt = useMemo(
    () => ({ color: exportColor, pxPerEm: Number(size), padEm: Number(pad) }),
    [exportColor, size, pad],
  );
  const dims = wordmark ? exportSize(wordmark, opt) : null;

  // 저장될 PNG와 같은 렌더링을 작게 미리 보여 줍니다.
  useEffect(() => {
    if (!wordmark) return;
    const id = setTimeout(() => {
      const c = renderToCanvas(wordmark, { ...opt, pxPerEm: 120 });
      c.toBlob((b) => {
        if (b) setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
      }, 'image/png');
    }, 80);
    return () => clearTimeout(id);
  }, [wordmark, opt]);

  const save = async () => {
    if (!wordmark) return;
    setBusy(true);
    try {
      const blob = await exportPngBlob(wordmark, opt);
      downloadBlob(blob, `${text.replace(/\s+/g, '-')}-wordmark.png`);
    } finally {
      setBusy(false);
    }
  };

  const panels = (['light', 'dark'] as const).map((bg) => {
    const color = resolveColor(params.color, bg);
    const ratio = contrast(color, BG[bg]);
    return { bg, color, ratio };
  });

  return (
    <main className="screen result">
      <header className="screen__head">
        <div>
          <p className="eyebrow">STEP 04 — 결과 확인 및 내보내기</p>
          <h1 className="screen__title">‘{text}’ 워드마크</h1>
        </div>
        <div className="screen__tools">
          <button className="btn btn--ghost" onClick={() => go('edit')}>
            ← 편집으로 돌아가기
          </button>
        </div>
      </header>

      <div className="result__body">
        <div className="result__previews">
          {panels.map(({ bg, ratio }) => (
            <figure key={bg} className="rpanel" style={{ background: BG[bg] }}>
              {wordmark && (
                <WordmarkSVG
                  layers={[{ wordmark, color: resolveColor(params.color, bg) }]}
                  pad={0.4}
                  label={`${text} (${bg === 'light' ? '밝은' : '어두운'} 배경)`}
                  className="rpanel__svg"
                />
              )}
              <figcaption className={bg === 'dark' ? 'rpanel__cap is-dark' : 'rpanel__cap'}>
                {bg === 'light' ? '밝은 배경' : '어두운 배경'}
                {ratio < 3 && <span className="rpanel__warn">대비가 낮아요 ({ratio.toFixed(1)}:1)</span>}
              </figcaption>
            </figure>
          ))}
        </div>

        <aside className="exportbox">
          <h2 className="panel__title">PNG 내보내기</h2>

          <div className="field">
            <span className="field__label">크기</span>
            <Segmented
              label="크기"
              value={size}
              options={SIZES.map((s) => ({ value: s.value, label: s.label }))}
              onChange={setSize}
            />
          </div>
          <div className="field">
            <span className="field__label">여백</span>
            <Segmented
              label="여백"
              value={pad}
              options={PADS.map((s) => ({ value: s.value, label: s.label }))}
              onChange={setPad}
            />
          </div>
          <div className="field">
            <span className="field__label">PNG 글자색</span>
            <Segmented<'current' | 'black' | 'white'>
              label="PNG 글자색"
              value={colorMode}
              options={[
                ...(params.color !== 'auto' ? [{ value: 'current' as const, label: '현재 색' }] : []),
                { value: 'black', label: '검정' },
                { value: 'white', label: '흰색' },
              ]}
              onChange={setColorMode}
            />
          </div>

          <div className="checker" aria-label="투명 배경 미리보기">
            {preview ? <img src={preview} alt="저장될 PNG 미리보기 (투명 배경)" /> : <span>불러오는 중…</span>}
          </div>
          <p className="field__note">체커보드 무늬가 비치는 곳이 투명 영역입니다.</p>

          {dims && (
            <p className="exportbox__dims">
              {dims.width} × {dims.height}px
              {dims.clamped && <span className="exportbox__warn"> · 브라우저 한계로 크기를 줄였어요</span>}
            </p>
          )}
          <button className="btn btn--primary btn--xl exportbox__save" onClick={save} disabled={!wordmark || busy}>
            {busy ? '만드는 중…' : 'PNG 저장'}
          </button>
        </aside>
      </div>
    </main>
  );
}
