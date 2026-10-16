import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { MAX_NAME, MAX_PRESETS, usePresets } from '../state/presets';
import type { Preset } from '../state/presets';
import { openProjectFile, saveProjectFile } from '../state/projectIO';
import { ProjectError } from '../core/project';
import { MiniWord } from './MiniWord';

/** 이름을 붙여 브라우저에 저장하는 '내 프리셋'과, 파일로 내려받고 여는 '작업 파일' */
export function PresetPanel() {
  const text = useStore((s) => s.text);
  const params = useStore((s) => s.params);
  const art = useStore((s) => s.art);
  const presets = usePresets((s) => s.presets);
  const { save, remove } = usePresets.getState();

  const [name, setName] = useState('');
  const [withArt, setWithArt] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const say = (kind: 'ok' | 'warn', t: string) => setMsg({ kind, text: t });

  const savePreset = () => {
    const { replaced } = save(name || `${text} ${presets.length + 1}`, text, params);
    say('ok', replaced ? '같은 이름의 프리셋을 덮어썼어요.' : '프리셋을 저장했어요. 이 브라우저에 남아요.');
    setName('');
  };

  const applyStyle = (p: Preset) => {
    // 글자별 수정은 그 이름에 묶여 있으므로, 다른 이름에 스타일만 적용할 때는 뺍니다.
    const same = p.text === text;
    useStore.getState().replaceParams(same ? p.params : { ...p.params, glyphs: {} });
    say('ok', same ? `‘${p.name}’을 적용했어요.` : `‘${p.name}’의 스타일을 지금 이름에 적용했어요. (글자별 수정은 제외)`);
  };

  const openPreset = (p: Preset) => {
    const st = useStore.getState();
    st.setText(p.text);
    st.startEditing(p.params, p.name);
    say('ok', `‘${p.name}’을 이름까지 그대로 열었어요.`);
  };

  const downloadFile = async () => {
    setBusy(true);
    try {
      await saveProjectFile(withArt);
      say('ok', '작업 파일을 내려받았어요.');
    } catch {
      say('warn', '파일을 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (file: File) => {
    setBusy(true);
    try {
      const { skippedArt } = await openProjectFile(file);
      say('ok', skippedArt ? `작업을 열었어요. 그림 ${skippedArt}장은 읽지 못해 빼고 열었어요.` : '작업을 열었어요.');
    } catch (e) {
      say('warn', e instanceof ProjectError ? e.message : '파일을 열지 못했어요.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <details className="presetbox">
      <summary>
        <span className="panel__title" style={{ margin: 0 }}>
          저장 · 불러오기
        </span>
        <span className="presetbox__count">{presets.length ? `프리셋 ${presets.length}` : ''}</span>
      </summary>

      <div className="presetbox__body">
        <h3 className="presetbox__h">내 프리셋 (이 브라우저에 저장)</h3>
        <div className="presetbox__row">
          <input
            className="presetbox__input"
            value={name}
            maxLength={MAX_NAME}
            placeholder="프리셋 이름"
            aria-label="프리셋 이름"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) savePreset();
            }}
          />
          <button type="button" className="btn btn--primary" onClick={savePreset} disabled={presets.length >= MAX_PRESETS && !name}>
            저장
          </button>
        </div>
        <p className="field__note" style={{ marginTop: 6 }}>
          지금 디자인(글자별 수정 포함)을 저장해요. 최대 {MAX_PRESETS}개.
        </p>

        {presets.length > 0 && (
          <ul className="presetlist" aria-label="저장한 프리셋">
            {presets.map((p) => (
              <li key={p.id} className="presetitem">
                <div className="presetitem__thumb">
                  <MiniWord text={p.text} params={p.params} className="presetitem__svg" />
                </div>
                <div className="presetitem__meta">
                  <strong>{p.name}</strong>
                  <span>{p.text}</span>
                  <div className="presetitem__actions">
                    <button type="button" className="btn btn--soft" onClick={() => applyStyle(p)}>
                      스타일 적용
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => openPreset(p)}>
                      그대로 열기
                    </button>
                    <button type="button" className="btn btn--ghost" aria-label={`${p.name} 지우기`} onClick={() => remove(p.id)}>
                      삭제
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="presetbox__h" style={{ marginTop: 18 }}>
          작업 파일 (.json)
        </h3>
        <div className="presetbox__row">
          <button type="button" className="btn btn--soft" onClick={downloadFile} disabled={busy}>
            파일로 저장
          </button>
          <button type="button" className="btn btn--soft" onClick={() => fileInput.current?.click()} disabled={busy}>
            파일 열기
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])}
          />
        </div>
        <label className="presetbox__check">
          <input type="checkbox" checked={withArt} onChange={(e) => setWithArt(e.target.checked)} />
          넣은 그림도 파일에 포함{art.length ? ` (${art.length}장)` : ''}
        </label>
        <p className="field__note">
          이름, 디자인, 처음 시안, 그림이 한 파일에 담겨요. 다른 컴퓨터에서도 열 수 있어요. 그림을 포함하면 파일이 커질 수 있어요.
        </p>

        {msg && (
          <p className={msg.kind === 'warn' ? 'hint hint--warn' : 'hint'} role="status" style={{ marginTop: 8 }}>
            {msg.text}
          </p>
        )}
      </div>
    </details>
  );
}
