import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { useStore } from '../state/store';
import { editableStrokes, isJamoDrawable, jamoCharsIn, skeletonStrokePath } from '../core/jamo';
import { simplifyFreehand } from '../core/freehand';
import { Segmented } from './Controls';
import type { GlyphOverride, Params, SkelNode, SkelStroke } from '../core/types';

/** 화면 좌표 -14..114 (0..100이 자모가 놓이는 상자, 바깥은 점을 끌어 낼 여유) */
const VB = '-14 -14 128 128';
const MAX_STROKES = 8;
const MAX_NODES = 32;

/** 사용법 안내: 빨간 점을 누르면 그 부분의 설명이 열립니다. */
const TIPS: Record<string, { title: string; body: string }> = {
  scope: {
    title: '적용 범위',
    body: "'모든 글자'는 이 자모가 쓰인 모든 글자를 한꺼번에 바꿔요. '선택한 글자만'은 미리보기에서 누른 그 글자 하나만 바꿔서, 같은 ㄱ도 글자마다 다르게 그릴 수 있어요.",
  },
  chips: {
    title: '고칠 자모',
    body: '고치고 싶은 자음·모음을 고르세요. 오른쪽 위에 작은 빨간 점이 있으면 이미 직접 그린 모양이에요.',
  },
  mode: {
    title: '편집 방식',
    body: "'점 편집'은 점을 끌어 모양을 다듬어요. '손으로 그리기'는 펜·손가락·마우스로 쓱 그으면 알아서 매끈한 획으로 바뀌고, 그린 뒤엔 점 편집으로 더 고칠 수 있어요.",
  },
  canvas: {
    title: '그리는 칸',
    body: '네모 칸이 글자 한 자모의 자리예요. 점을 끌어 옮기고, 선 위를 누르면 그 자리에 점이 생겨요. 점을 고른 뒤 방향키로 조금씩 옮길 수도 있어요. 칸 밖으로도 끌어낼 수 있어요.',
  },
  snap: {
    title: '격자 맞추기',
    body: '켜 두면 점이 격자에 딱딱 붙어 반듯하게 그려져요. 끄거나 Alt를 누르고 끌면 자유롭게 놓을 수 있어요.',
  },
  node: {
    title: '점 다루기',
    body: "■ 네모 점은 꺾이고 ● 동그란 점은 이웃 점을 따라 부드럽게 휘어요. 점을 고른 뒤 '꺾이게/부드럽게'로 바꾸고, '점 지우기'로 없애고, '선택한 획 지우기'로 획 하나를 없애요.",
  },
  add: {
    title: '획 추가·뒤집기',
    body: "'선 추가'와 '고리 추가'로 획을 더하고(최대 8개), 좌우·상하 뒤집기로 모양을 거꾸로 돌려요.",
  },
  reset: {
    title: '되돌리기',
    body: '지금 고른 범위에서 직접 그린 모양을 지우고 기본 모양으로 돌려놓아요. 다른 자모나 다른 글자에는 영향이 없어요.',
  },
};
const TIP_ORDER = ['scope', 'chips', 'mode', 'canvas', 'snap', 'node', 'add', 'reset'];

function Tip({ id, help, open, onOpen, children }: { id: string; help: boolean; open: string | null; onOpen: (id: string | null) => void; children: React.ReactNode }) {
  const tip = TIPS[id];
  const isOpen = help && open === id;
  return (
    <div className="tip">
      {help && (
        <button
          type="button"
          className={isOpen ? 'tip__dot is-open' : 'tip__dot'}
          aria-label={`${tip.title} 설명 ${isOpen ? '닫기' : '보기'}`}
          aria-expanded={isOpen}
          onClick={() => onOpen(isOpen ? null : id)}
        >
          {TIP_ORDER.indexOf(id) + 1}
        </button>
      )}
      {children}
      {isOpen && (
        <div className="tip__note" role="note">
          <strong>{tip.title}</strong>
          <p>{tip.body}</p>
          <button type="button" className="tip__next" onClick={() => onOpen(TIP_ORDER[(TIP_ORDER.indexOf(id) + 1) % TIP_ORDER.length])}>
            {id === TIP_ORDER[TIP_ORDER.length - 1] ? '처음부터 다시' : '다음 ▸'}
          </button>
        </div>
      )}
    </div>
  );
}

type Sel = { s: number; n: number } | null; // n === -1이면 고리 전체

const clone = (strokes: SkelStroke[]) => JSON.parse(JSON.stringify(strokes)) as SkelStroke[];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Drag =
  | { kind: 'node'; s: number; n: number }
  | { kind: 'ringc'; s: number }
  | { kind: 'ringr'; s: number }
  | null;

/**
 * 자음·모음의 뼈대를 점으로 직접 고칩니다.
 * 고친 모양은 그 자모가 쓰인 모든 글자에 적용되고, 작업 파일·프리셋에 함께 저장됩니다.
 */
export function SkeletonEditor({ p, set }: { p: Params; set: (patch: Partial<Params>) => void }) {
  const text = useStore((s) => s.text);
  const selected = useStore((s) => s.selectedGlyph);
  const [scope, setScope] = useState<'all' | 'glyph'>('all');
  const glyphChars = Array.from(text).filter(isJamoDrawable);
  const gidx = selected !== null && selected < glyphChars.length ? selected : null;
  const perGlyph = scope === 'glyph' && gidx !== null;
  const ov: GlyphOverride = gidx !== null ? (p.glyphs[gidx] ?? {}) : {};
  const own = perGlyph ? ov.skeletons : undefined;
  const chars = jamoCharsIn(scope === 'glyph' ? (gidx !== null ? glyphChars[gidx] : '') : text);
  const [picked, setPicked] = useState<string | null>(null);
  const ch = picked && chars.includes(picked) ? picked : (chars[0] ?? null);
  const [sel, setSel] = useState<Sel>(null);
  const [snap, setSnap] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null);
  const [mode, setMode] = useState<'edit' | 'draw'>('edit');
  const [live, setLive] = useState<[number, number][]>([]);
  const drawing = useRef<[number, number][] | null>(null);
  /** 새로 그리기: 다음 선부터 기존 뼈대를 지우고 처음부터 시작 */
  const [fresh, setFresh] = useState(false);
  const [drawNote, setDrawNote] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [tipOpen, setTipOpen] = useState<string | null>(null);
  const T = (id: string, children: React.ReactNode) => (
    <Tip id={id} help={help} open={tipOpen} onOpen={setTipOpen}>
      {children}
    </Tip>
  );

  const custom = ch ? (perGlyph ? own?.[ch] : p.skeletons[ch]) : undefined;
  const strokes = useMemo<SkelStroke[]>(
    () => (ch ? editableStrokes(ch, p.variants[ch] ?? 0, p.skeletons, own) : []),
    [ch, p.variants, p.skeletons, own],
  );

  const helpBar = (
    <div className="helpbar">
      <button
        type="button"
        className={help ? 'helpbtn is-on' : 'helpbtn'}
        aria-pressed={help}
        onClick={() => {
          setHelp((h) => !h);
          setTipOpen(help ? null : TIP_ORDER[0]);
        }}
      >
        <span className="helpbtn__q">?</span>
        {help ? '사용법 닫기' : '사용법 보기'}
      </button>
      {help && <span className="helpbar__hint">빨간 점을 눌러 보세요</span>}
    </div>
  );

  const scopeToggle = T('scope', 
    <div className="field" style={{ marginBottom: 10 }}>
      <Segmented<'all' | 'glyph'>
        label="적용 범위"
        value={scope}
        options={[
          { value: 'all', label: '모든 글자' },
          { value: 'glyph', label: '선택한 글자만' },
        ]}
        onChange={(v) => {
          setScope(v);
          setPicked(null);
          setSel(null);
        }}
      />
    </div>,
  );

  if (scope === 'glyph' && gidx === null)
    return (
      <>
        {helpBar}
        {scopeToggle}
        <p className="field__note">미리보기에서 글자를 눌러 고르면, 그 글자의 자모만 따로 그릴 수 있어요.</p>
      </>
    );
  if (!ch)
    return (
      <>
        {helpBar}
        {scopeToggle}
        <p className="field__note">이 이름에는 직접 그릴 수 있는 자음·모음이 없어요.</p>
      </>
    );

  const writeGlyph = (skeletons: Record<string, SkelStroke[]>) => {
    if (gidx === null) return;
    const next: GlyphOverride = { ...ov, skeletons };
    if (Object.keys(skeletons).length === 0) delete next.skeletons;
    const glyphs = { ...p.glyphs };
    if (Object.keys(next).length === 0) delete glyphs[gidx];
    else glyphs[gidx] = next;
    set({ glyphs });
  };

  const commit = (next: SkelStroke[]) => {
    if (perGlyph) writeGlyph({ ...ov.skeletons, [ch]: next });
    else set({ skeletons: { ...p.skeletons, [ch]: next } });
  };

  /** 포인터 위치를 0..1 상자 좌표로 */
  const toBox = (e: { clientX: number; clientY: number; altKey?: boolean }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const q = m ? pt.matrixTransform(m.inverse()) : pt;
    const step = snap && !e.altKey ? 0.05 : 0;
    const f = (v: number) => clamp(step ? Math.round(v / step) * step : v, -0.5, 1.5);
    return { x: f(q.x / 100), y: f(q.y / 100) };
  };

  /** 손으로 그릴 때는 격자에 맞추지 않고 그대로 따라갑니다. */
  const toFree = (e: { clientX: number; clientY: number }): [number, number] => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const q = m ? pt.matrixTransform(m.inverse()) : pt;
    return [clamp(q.x / 100, -0.3, 1.3), clamp(q.y / 100, -0.3, 1.3)];
  };

  const rootDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (mode === 'draw') {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = [toFree(e)];
      setLive([...drawing.current]);
      setDrawNote(null);
      return;
    }
    setSel(null);
  };

  const rootMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drawing.current;
    if (d) {
      const p = toFree(e);
      const last = d[d.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) {
        d.push(p);
        setLive([...d]);
      }
      return;
    }
    onMove(e);
  };

  const rootUp = () => {
    const d = drawing.current;
    if (!d) {
      endDrag();
      return;
    }
    drawing.current = null;
    setLive([]);
    const stroke = simplifyFreehand(d);
    if (!stroke) {
      setDrawNote('선이 너무 짧아서 건너뛰었어요.');
      return;
    }
    if (!fresh && strokes.length >= MAX_STROKES) {
      setDrawNote(`획은 ${MAX_STROKES}개까지 넣을 수 있어요. 점 편집에서 획을 지워 주세요.`);
      return;
    }
    const next = fresh ? [stroke] : [...clone(strokes), stroke];
    setFresh(false);
    commit(next);
    setSel(null);
  };

  const removeLast = () => {
    if (strokes.length <= 1) return;
    commit(clone(strokes).slice(0, -1));
    setSel(null);
  };

  const startDrag = (e: RPointerEvent<SVGElement>, d: Drag) => {
    e.stopPropagation();
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onMove = (e: RPointerEvent<SVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = toBox(e);
    const next = clone(strokes);
    const st = next[d.s];
    if (d.kind === 'node' && st?.t === 'path') {
      st.nodes[d.n].x = x;
      st.nodes[d.n].y = y;
    } else if (d.kind === 'ringc' && st?.t === 'ring') {
      st.c = [x, y];
    } else if (d.kind === 'ringr' && st?.t === 'ring') {
      st.r = clamp(Math.hypot(x - st.c[0], y - st.c[1]), 0.03, 0.9);
    }
    commit(next);
  };

  const endDrag = () => {
    drag.current = null;
  };

  /** 선분 위를 누르면 그 자리에 점을 하나 더하고 바로 끌 수 있게 합니다. */
  const insertAt = (e: RPointerEvent<SVGElement>, si: number, after: number) => {
    const st = strokes[si];
    if (st?.t !== 'path' || st.nodes.length >= MAX_NODES) return;
    const { x, y } = toBox(e);
    const next = clone(strokes);
    const target = next[si];
    if (target.t !== 'path') return;
    target.nodes.splice(after + 1, 0, { x, y });
    commit(next);
    setSel({ s: si, n: after + 1 });
    startDrag(e, { kind: 'node', s: si, n: after + 1 });
  };

  const selStroke = sel ? strokes[sel.s] : undefined;
  const selNode: SkelNode | undefined =
    sel && selStroke?.t === 'path' && sel.n >= 0 ? selStroke.nodes[sel.n] : undefined;

  const toggleSmooth = () => {
    if (!sel || !selNode) return;
    const next = clone(strokes);
    const st = next[sel.s];
    if (st.t !== 'path') return;
    const nd = st.nodes[sel.n];
    if (nd.s) delete nd.s;
    else nd.s = true;
    commit(next);
  };

  const deleteNode = () => {
    if (!sel || !selNode) return;
    const next = clone(strokes);
    const st = next[sel.s];
    if (st.t !== 'path' || st.nodes.length <= 2) return;
    st.nodes.splice(sel.n, 1);
    commit(next);
    setSel({ s: sel.s, n: Math.min(sel.n, st.nodes.length - 1) });
  };

  const deleteStroke = () => {
    if (!sel || strokes.length <= 1) return;
    const next = clone(strokes);
    next.splice(sel.s, 1);
    commit(next);
    setSel(null);
  };

  const addLine = () => {
    if (strokes.length >= MAX_STROKES) return;
    const next = clone(strokes);
    next.push({ t: 'path', nodes: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }] });
    commit(next);
    setSel({ s: next.length - 1, n: 0 });
  };

  const addRing = () => {
    if (strokes.length >= MAX_STROKES) return;
    const next = clone(strokes);
    next.push({ t: 'ring', c: [0.5, 0.5], r: 0.25 });
    commit(next);
    setSel({ s: next.length - 1, n: -1 });
  };

  const flip = (axis: 'x' | 'y') => {
    const next = clone(strokes);
    for (const st of next) {
      if (st.t === 'ring') {
        if (axis === 'x') st.c[0] = 1 - st.c[0];
        else st.c[1] = 1 - st.c[1];
      } else {
        for (const n of st.nodes) {
          if (axis === 'x') n.x = 1 - n.x;
          else n.y = 1 - n.y;
        }
        // 뒤집으면 점 순서의 방향도 거꾸로 바뀌므로 그대로 둬도 모양은 맞습니다.
      }
    }
    commit(next);
  };

  const reset = () => {
    if (perGlyph) {
      const sk = { ...ov.skeletons };
      delete sk[ch];
      writeGlyph(sk);
      setSel(null);
      return;
    }
    const skeletons = { ...p.skeletons };
    delete skeletons[ch];
    set({ skeletons });
    setSel(null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!sel) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selNode) {
      e.preventDefault();
      deleteNode();
    } else if (e.key.startsWith('Arrow') && selNode) {
      e.preventDefault();
      const d = e.shiftKey ? 0.05 : 0.01;
      const next = clone(strokes);
      const st = next[sel.s];
      if (st.t !== 'path') return;
      const nd = st.nodes[sel.n];
      if (e.key === 'ArrowLeft') nd.x = clamp(nd.x - d, -0.5, 1.5);
      if (e.key === 'ArrowRight') nd.x = clamp(nd.x + d, -0.5, 1.5);
      if (e.key === 'ArrowUp') nd.y = clamp(nd.y - d, -0.5, 1.5);
      if (e.key === 'ArrowDown') nd.y = clamp(nd.y + d, -0.5, 1.5);
      commit(next);
    }
  };

  return (
    <>
      {helpBar}
      <p className="field__note" style={{ marginTop: 0, marginBottom: 10 }}>
        점을 끌어서 모양을 바꿔요. 선 위를 누르면 점이 생겨요.{' '}
        {perGlyph ? (
          <>바꾼 모양은 지금 고른 <strong>이 글자({glyphChars[gidx!]})에만</strong> 적용돼요.</>
        ) : (
          <>바꾼 모양은 이 자모가 들어간 <strong>모든 글자</strong>에 적용돼요.</>
        )}
      </p>
      {scopeToggle}
      {T('chips', <div className="glyphchips" role="listbox" aria-label="고칠 자모">
        {chars.map((c) => (
          <button
            key={c}
            type="button"
            role="option"
            aria-selected={c === ch}
            className={c === ch ? 'glyphchip is-on' : 'glyphchip'}
            onClick={() => {
              setPicked(c);
              setSel(null);
            }}
          >
            {c}
            {(perGlyph ? own?.[c] : p.skeletons[c]) && <span className="glyphchip__dot" aria-label="직접 그림" />}
          </button>
        ))}
      </div>)}

      {T('mode', <div className="field" style={{ marginBottom: 10 }}>
        <Segmented<'edit' | 'draw'>
          label="뼈대 편집 방식"
          value={mode}
          options={[
            { value: 'edit', label: '점 편집' },
            { value: 'draw', label: '손으로 그리기' },
          ]}
          onChange={(v) => {
            setMode(v);
            setSel(null);
            if (v === 'edit') setFresh(false);
          }}
        />
        {mode === 'draw' && (
          <p className="field__note">
            아래 칸에 펜·손가락·마우스로 선을 그리면 자동으로 매끈하게 다듬어져 획이 돼요. 꺾이는 곳은 꺾인 채로, 완만한 곳은
            부드럽게 남고, 처음과 끝이 만나면 고리가 돼요. 그린 뒤에는 ‘점 편집’에서 점을 더 고칠 수 있어요.
          </p>
        )}
      </div>)}
      {T('canvas', <div className="skel" onKeyDown={onKey} tabIndex={0} aria-label={`${ch} 뼈대 편집 영역`}>
        <svg
          ref={svgRef}
          viewBox={VB}
          className={mode === 'draw' ? 'skel__svg is-drawing' : 'skel__svg'}
          onPointerMove={rootMove}
          onPointerUp={rootUp}
          onPointerCancel={rootUp}
          onPointerDown={rootDown}
        >
          <rect x={0} y={0} width={100} height={100} className="skel__box" />
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((g) => (
            <g key={g} className={g === 50 ? 'skel__grid is-mid' : 'skel__grid'}>
              <line x1={g} x2={g} y1={0} y2={100} />
              <line y1={g} y2={g} x1={0} x2={100} />
            </g>
          ))}

          {/* 실제로 그려지는 선 (굵게, 연하게) */}
          {strokes.map((st, i) => (
            <path key={`p${i}`} d={skeletonStrokePath(st)} className="skel__line" pointerEvents="none" />
          ))}

          {/* 지금 그리고 있는 선 */}
          {live.length > 1 && (
            <polyline points={live.map((q) => `${q[0] * 100},${q[1] * 100}`).join(' ')} className="skel__live" pointerEvents="none" />
          )}

          {/* 선분을 눌러 점 추가 */}
          {strokes.map((st, si) =>
            st.t === 'path'
              ? st.nodes.map((nd, ni) => {
                  const last = st.closed ? ni === st.nodes.length - 1 : ni === st.nodes.length - 1;
                  if (last && !st.closed) return null;
                  const nx = st.nodes[(ni + 1) % st.nodes.length];
                  return (
                    <line
                      key={`h${si}-${ni}`}
                      x1={nd.x * 100}
                      y1={nd.y * 100}
                      x2={nx.x * 100}
                      y2={nx.y * 100}
                      className="skel__hit"
                      onPointerDown={(e) => insertAt(e, si, ni)}
                    />
                  );
                })
              : null,
          )}
          {strokes.map((st, si) =>
            st.t === 'ring' ? (
              <circle
                key={`rh${si}`}
                cx={st.c[0] * 100}
                cy={st.c[1] * 100}
                r={st.r * 100}
                className="skel__hit skel__hit--ring"
                fill="none"
                onPointerDown={(e) => {
                  setSel({ s: si, n: -1 });
                  startDrag(e, { kind: 'ringc', s: si });
                }}
              />
            ) : null,
          )}

          {/* 점 */}
          {strokes.map((st, si) =>
            st.t === 'path' ? (
              st.nodes.map((nd, ni) => {
                const on = sel?.s === si && sel.n === ni;
                const common = {
                  className: on ? 'skel__node is-on' : 'skel__node',
                  onPointerDown: (e: RPointerEvent<SVGElement>) => {
                    setSel({ s: si, n: ni });
                    startDrag(e, { kind: 'node', s: si, n: ni });
                  },
                };
                return nd.s ? (
                  <circle key={`n${si}-${ni}`} cx={nd.x * 100} cy={nd.y * 100} r={3.4} {...common} />
                ) : (
                  <rect key={`n${si}-${ni}`} x={nd.x * 100 - 3} y={nd.y * 100 - 3} width={6} height={6} {...common} />
                );
              })
            ) : (
              <g key={`rn${si}`}>
                <circle
                  cx={st.c[0] * 100}
                  cy={st.c[1] * 100}
                  r={3.2}
                  className={sel?.s === si ? 'skel__node is-on' : 'skel__node'}
                  onPointerDown={(e) => {
                    setSel({ s: si, n: -1 });
                    startDrag(e, { kind: 'ringc', s: si });
                  }}
                />
                <circle
                  cx={(st.c[0] + st.r) * 100}
                  cy={st.c[1] * 100}
                  r={3.2}
                  className="skel__node skel__node--radius"
                  onPointerDown={(e) => {
                    setSel({ s: si, n: -1 });
                    startDrag(e, { kind: 'ringr', s: si });
                  }}
                />
              </g>
            ),
          )}
        </svg>
      </div>)}

      {T('snap', <label className="presetbox__check">
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        격자에 맞추기 (Alt를 누르고 끌면 잠시 해제)
      </label>)}

      {T('node', <div className="artactions" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn--soft" disabled={!selNode} onClick={toggleSmooth}>
          {selNode?.s ? '꺾이게' : '부드럽게'}
        </button>
        <button
          type="button"
          className="btn btn--soft"
          disabled={!selNode || (selStroke?.t === 'path' && selStroke.nodes.length <= 2)}
          onClick={deleteNode}
        >
          점 지우기
        </button>
        <button type="button" className="btn btn--soft" disabled={!sel || strokes.length <= 1} onClick={deleteStroke}>
          선택한 획 지우기
        </button>
      </div>)}
      {T('add', <div className="artactions" style={{ marginTop: 6 }}>
        <button type="button" className="btn btn--soft" disabled={strokes.length >= MAX_STROKES} onClick={addLine}>
          선 추가
        </button>
        <button type="button" className="btn btn--soft" disabled={strokes.length >= MAX_STROKES} onClick={addRing}>
          고리 추가
        </button>
        <button type="button" className="btn btn--soft" onClick={() => flip('x')}>
          좌우 뒤집기
        </button>
        <button type="button" className="btn btn--soft" onClick={() => flip('y')}>
          상하 뒤집기
        </button>
      </div>)}
      {mode === 'draw' && (
        <div className="artactions" style={{ marginTop: 6 }}>
          <button
            type="button"
            className={fresh ? 'btn btn--soft is-on' : 'btn btn--soft'}
            aria-pressed={fresh}
            onClick={() => setFresh((f) => !f)}
          >
            {fresh ? '다음 선부터 새로 시작(켜짐)' : '새로 그리기'}
          </button>
          <button type="button" className="btn btn--soft" disabled={strokes.length <= 1} onClick={removeLast}>
            마지막 획 지우기
          </button>
        </div>
      )}
      {drawNote && (
        <p className="hint hint--warn" role="status" style={{ marginTop: 6 }}>
          {drawNote}
        </p>
      )}
      {T('reset', <div className="artactions" style={{ marginTop: 6 }}>
        <button type="button" className="btn btn--ghost" disabled={!custom} onClick={reset}>
          {ch}을(를) 기본 모양으로 되돌리기
        </button>
      </div>)}
      <p className="field__note" style={{ marginTop: 8 }}>
        ■ 네모 점은 꺾이고, ● 동그란 점은 이웃 점을 따라 부드럽게 휘어요. 점을 고르고 방향키로 조금씩 옮길 수도 있어요.
      </p>
    </>
  );
}
