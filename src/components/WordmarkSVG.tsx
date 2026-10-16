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
  label?: string;
  className?: string;
}

const ACCENT = '#ff3b1d';

export function WordmarkSVG({ layers, pad = 0.12, guides = false, label, className }: Props) {
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
                  fill={l.color}
                  stroke={w.strokeWidth > 0 ? l.color : 'none'}
                  strokeWidth={w.strokeWidth}
                  strokeLinejoin={w.linejoin}
                  strokeMiterlimit={w.miterLimit}
                  opacity={w.opacity}
                />
              ))
            )}
          </g>
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
