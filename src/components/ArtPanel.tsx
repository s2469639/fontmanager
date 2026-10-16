import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { ArtError, MAX_ART_LAYERS, readArtFile } from '../core/art';
import type { ArtLayer } from '../core/art';
import type { Wordmark } from '../core/types';
import { UNIT } from '../core/types';
import { Segmented, Slider } from './Controls';

/** 글자 뒤(또는 앞)에 깔 그림을 첨부하고 위치·크기·회전·투명도를 조절합니다. */
export function ArtPanel({ wm }: { wm: Wordmark | null }) {
  const art = useStore((s) => s.art);
  const selectedId = useStore((s) => s.selectedArt);
  const { addArt, updateArt, removeArt, selectArt } = useStore.getState();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const wmW = Math.max(300, wm?.bbox.w ?? 1200);
  const wmH = Math.max(300, wm?.bbox.h ?? 800);
  const sel = art.find((l) => l.id === selectedId) ?? null;

  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (useStore.getState().art.length >= MAX_ART_LAYERS) {
          setError(`그림은 ${MAX_ART_LAYERS}장까지 넣을 수 있어요.`);
          break;
        }
        try {
          const info = await readArtFile(file);
          // 처음에는 글자 뒤에 글자와 비슷한 크기로 깔아 줍니다.
          const ratio = info.natH / info.natW;
          const width = Math.min(wmW * 1.05, (wmH * 1.4) / Math.max(0.2, ratio));
          const layer: ArtLayer = {
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
            name: info.name,
            src: info.src,
            natW: info.natW,
            natH: info.natH,
            ox: 0,
            oy: 0,
            width,
            rot: 0,
            opacity: 1,
            flipX: false,
            front: false,
          };
          addArt(layer);
        } catch (e) {
          setError(e instanceof ArtError ? e.message : '그림을 넣지 못했어요.');
        }
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const set = (patch: Partial<ArtLayer>) => sel && updateArt(sel.id, patch);

  return (
    <section className="panel__section">
      <h2 className="panel__title">그림 넣기</h2>
      <div
        className={over ? 'dropzone is-over' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
      >
        <p className="dropzone__text">
          글자 뒤에 깔 그림을 올려 보세요. <strong>투명 배경 PNG</strong>를 쓰면 글자 뒤가 그대로 비쳐요.
        </p>
        <button type="button" className="btn btn--soft" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? '불러오는 중…' : '그림 파일 고르기'}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/webp,image/jpeg,image/svg+xml"
          multiple
          hidden
          onChange={(e) => e.target.files && void addFiles(e.target.files)}
        />
        <p className="field__note" style={{ marginTop: 8 }}>
          PNG·WebP·JPG·SVG, 최대 {MAX_ART_LAYERS}장. 파일은 이 브라우저 안에서만 쓰이고 올라가지 않아요.
          새로고침하면 그림은 사라집니다.
        </p>
      </div>
      {error && (
        <p className="hint hint--warn" role="alert" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}

      {art.length > 0 && (
        <ul className="artlist" aria-label="넣은 그림">
          {art.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={l.id === selectedId ? 'artitem is-on' : 'artitem'}
                onClick={() => selectArt(l.id === selectedId ? null : l.id)}
              >
                <img src={l.src} alt="" />
                <span className="artitem__name">{l.name}</span>
                <span className="artitem__tag">{l.front ? '앞' : '뒤'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <div className="glypheditor">
          <p className="field__note" style={{ marginTop: 0, marginBottom: 10 }}>
            미리보기에서 그림을 끌어서 옮길 수도 있어요.
          </p>
          <div className="field">
            <span className="field__label">겹치는 순서</span>
            <Segmented<'back' | 'front'>
              label="그림 순서"
              value={sel.front ? 'front' : 'back'}
              options={[
                { value: 'back', label: '글자 뒤' },
                { value: 'front', label: '글자 앞' },
              ]}
              onChange={(v) => set({ front: v === 'front' })}
            />
          </div>
          <Slider
            label="크기"
            value={sel.width}
            min={Math.round(wmW * 0.05)}
            max={Math.round(wmW * 5)}
            step={5}
            display={`글자 폭의 ${Math.round((sel.width / wmW) * 100)}%`}
            onChange={(v) => set({ width: v })}
          />
          <Slider
            label="가로 위치"
            value={sel.ox}
            min={-Math.round(wmW * 2)}
            max={Math.round(wmW * 2)}
            step={5}
            display={`${(sel.ox / UNIT).toFixed(2)}em`}
            onChange={(v) => set({ ox: v })}
          />
          <Slider
            label="세로 위치"
            value={sel.oy}
            min={-Math.round(wmH * 3)}
            max={Math.round(wmH * 3)}
            step={5}
            display={`${(sel.oy / UNIT).toFixed(2)}em`}
            onChange={(v) => set({ oy: v })}
          />
          <Slider
            label="회전"
            value={sel.rot}
            min={-180}
            max={180}
            step={1}
            display={`${sel.rot}°`}
            onChange={(v) => set({ rot: v })}
          />
          <Slider
            label="투명도"
            value={sel.opacity}
            min={0.05}
            max={1}
            step={0.01}
            display={`${Math.round(sel.opacity * 100)}%`}
            onChange={(v) => set({ opacity: v })}
          />
          <div className="artactions">
            <button type="button" className="btn btn--soft" onClick={() => set({ flipX: !sel.flipX })}>
              좌우 반전
            </button>
            <button type="button" className="btn btn--soft" onClick={() => set({ ox: 0, oy: 0 })}>
              글자 가운데로
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => removeArt(sel.id)}>
              이 그림 지우기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
