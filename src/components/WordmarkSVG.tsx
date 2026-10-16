import { useId } from 'react';
import type { Wordmark } from '../core/types';
import { UNIT } from '../core/types';

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
  /** 글자를 눌러 고를 수 있게 합니다 (첫 번째 레이어 기준) */
  selectable?: { selected: number | null; onSelect: (i: number) => void };
  label?: string;
  className?: string;
}

const ACCENT = '#ff3b1d';

export function WordmarkSVG({ layers, pad = 0.12, guides = false, selectable, label, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (layers.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { wordmark: w } of layers) {
    x0 = Math.min(x0, w.bbox.x);
    y0 = Math.min(y0, w.bbox.y);
    x1 = Math.max(x1, w.bbox.x + w.bbox.w);
    y1 = Math.max(y1, w.bbox.y + w.bbox.h);
  }
  const p = pad * UNIT;
  const vx = x0 - p, vy = y0 - p, vw = x1 - x0 + p * 2, vh = y1 - y0 + p * 2;

  return (
    <svg
      className={className}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      {layers.map((l, i) => {
        const w = l.wordmark;
        const needsMask = w.knockout || l.ghost;
        const maskId = `m${uid}${i}`;
        return (
          <g key={i}>
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
