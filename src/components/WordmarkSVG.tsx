import { useId, useRef } from 'react';
import type { Wordmark } from '../core/types';
import { UNIT } from '../core/types';
import { artHeight, artTransform, contentBox, wordCenter } from '../core/art';
import type { ArtLayer } from '../core/art';

export interface Layer {
  wordmark: Wordmark;
  color: string;
  /** true면 비교용 윤곽선으로만 그립니다 */
  ghost?: boolean;
}

interface Props {
  layers: Layer[];
  /** 여백(em) */
  pad?: number;
  guides?: boolean;
  /** 글자 앞뒤에 깔리는 첨부 그림 */
  art?: ArtLayer[];
  /** 그림을 눌러 고르고 끌어서 옮길 수 있게 합니다 */
  artEdit?: { selectedId: string | null; onSelect: (id: string | null) => void; onMove: (id: string, ox: number, oy: number) => void };
  /** 글자를 눌러 고를 수 있게 합니다 (첫 번째 레이어 기준) */
  selectable?: { selected: number | null; onSelect: (i: number) => void };
  label?: string;
  className?: string;
}

const ACCENT = '#ff3b1d';

export function WordmarkSVG({ layers, pad = 0.12, guides = false, art = [], artEdit, selectable, label, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  if (layers.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { wordmark: w } of layers) {
    x0 = Math.min(x0, w.bbox.x);
    y0 = Math.min(y0, w.bbox.y);
    x1 = Math.max(x1, w.bbox.x + w.bbox.w);
    y1 = Math.max(y1, w.bbox.y + w.bbox.h);
  }
  // 첨부 그림까지 모두 보이도록 화면 범위를 넓힙니다.
  const wmBox = layers[0].wordmark.bbox;
  const center = wordCenter(wmBox);
  if (art.length) {
    const all = contentBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, art);
    x0 = all.x;
    y0 = all.y;
    x1 = all.x + all.w;
    y1 = all.y + all.h;
  }

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : pt;
  };
  const renderArt = (l: ArtLayer) => {
    const h = artHeight(l);
    const sel = artEdit?.selectedId === l.id;
    return (
      <g key={l.id} transform={artTransform(l, center)} opacity={l.opacity}>
        <image
          href={l.src}
          x={-l.width / 2}
          y={-h / 2}
          width={l.width}
          height={h}
          preserveAspectRatio="none"
          style={artEdit ? { cursor: 'grab', touchAction: 'none' } : undefined}
          onPointerDown={
            artEdit
              ? (e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = toSvg(e);
                  drag.current = { id: l.id, sx: p.x, sy: p.y, ox: l.ox, oy: l.oy };
                  artEdit.onSelect(l.id);
                }
              : undefined
          }
          onPointerMove={
            artEdit
              ? (e) => {
                  const d = drag.current;
                  if (!d || d.id !== l.id) return;
                  const p = toSvg(e);
                  artEdit.onMove(l.id, d.ox + (p.x - d.sx), d.oy + (p.y - d.sy));
                }
              : undefined
          }
          onPointerUp={artEdit ? () => (drag.current = null) : undefined}
        />
        {sel && (
          <rect
            x={-l.width / 2}
            y={-h / 2}
            width={l.width}
            height={h}
            fill="none"
            stroke={ACCENT}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </g>
    );
  };
  const p = pad * UNIT;
  const vx = x0 - p, vy = y0 - p, vw = x1 - x0 + p * 2, vh = y1 - y0 + p * 2;

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      {artEdit && (
        <rect x={vx} y={vy} width={vw} height={vh} fill="transparent" onClick={() => artEdit.onSelect(null)} />
      )}
      {art.filter((l) => !l.front).map(renderArt)}
      {layers.map((l, i) => {
        const w = l.wordmark;
        const needsMask = w.knockout || l.ghost;
        const maskId = `m${uid}${i}`;
        const cutId = `c${uid}${i}`;
        const cut = !l.ghost && w.cuts.length > 0;
        return (
          <g key={i} mask={cut ? `url(#${cutId})` : undefined}>
            {cut && (
              <mask id={cutId} maskUnits="userSpaceOnUse" x={vx} y={vy} width={vw} height={vh}>
                <rect x={vx} y={vy} width={vw} height={vh} fill="#fff" />
                {w.cuts.map((poly, k) => (
                  <polygon key={k} points={poly.map((pt) => `${pt[0]},${pt[1]}`).join(' ')} fill="#000" />
                ))}
              </mask>
            )}
            {needsMask && (
              <mask id={maskId} maskUnits="userSpaceOnUse" x={vx} y={vy} width={vw} height={vh}>
                <rect x={vx} y={vy} width={vw} height={vh} fill="#fff" />
                {w.paths.map((d, j) => (
                  <path key={j} d={d} fill="#000" />
                ))}
              </mask>
            )}
            {l.ghost ? (
              <g mask={`url(#${maskId})`}>
                {w.paths.map((d, j) => (
                  <path
                    key={j}
                    d={d}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={3}
                    strokeDasharray="8 6"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            ) : w.knockout ? (
              <g mask={`url(#${maskId})`} opacity={w.opacity}>
                {w.paths.map((d, j) => (
                  <path
                    key={j}
                    d={d}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={w.strokeWidth}
                    strokeLinejoin={w.linejoin}
                    strokeMiterlimit={w.miterLimit}
                  />
                ))}
              </g>
            ) : (
              w.paths.map((d, j) => (
                <path
                  key={j}
                  d={d}
                  fill={w.fill ? l.color : 'none'}
                  stroke={w.strokeWidth > 0 ? l.color : 'none'}
                  strokeWidth={w.widths[j] ?? w.strokeWidth}
                  strokeLinecap={w.linecap}
                  strokeLinejoin={w.linejoin}
                  strokeMiterlimit={w.miterLimit}
                  opacity={w.opacity}
                />
              ))
            )}
          </g>
        );
      })}
      {art.filter((l) => l.front).map(renderArt)}
      {selectable &&
        layers[0].wordmark.boxes.map((b, i) => {
          const on = selectable.selected === i;
          return (
            <rect
              key={i}
              x={b.x - 40}
              y={b.y - 40}
              width={b.w + 80}
              height={b.h + 80}
              rx={30}
              fill="transparent"
              stroke={on ? ACCENT : 'none'}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'pointer' }}
              onClick={() => selectable.onSelect(i)}
              aria-label={`${i + 1}번째 글자 선택`}
            />
          );
        })}
      {guides && (
        <g stroke={ACCENT} strokeWidth={1} fill="none" opacity={0.85}>
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          <line x1={vx} x2={vx + vw} y1={0} y2={0} vectorEffect="non-scaling-stroke" opacity={0.6} />
          <line x1={(x0 + x1) / 2} x2={(x0 + x1) / 2} y1={vy} y2={vy + vh} vectorEffect="non-scaling-stroke" opacity={0.6} />
        </g>
      )}
    </svg>
  );
}
