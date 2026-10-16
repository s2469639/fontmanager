import { useMemo } from 'react';
import { useStore } from '../state/store';
import { DIRECTIONS, directionOf } from '../data/styles';
import { describeDiff, mulberry32, mutate } from '../core/variation';
import { WordCard } from '../components/WordCard';
import type { Params } from '../core/types';
import type { Route } from '../state/router';

const VARIANT_COUNT = 8;

export function Explore({ go }: { go: (r: Route) => void }) {
  const text = useStore((s) => s.text);
  const center = useStore((s) => s.exploreCenter);
  const siblings = useStore((s) => s.exploreSiblings);
  const seed = useStore((s) => s.exploreSeed);
  const trail = useStore((s) => s.trail);
  const setExplore = useStore((s) => s.setExplore);
  const startEditing = useStore((s) => s.startEditing);

  const variants = useMemo(() => {
    if (!center) return [];
    const rng = mulberry32(seed * 7919 + 13);
    return Array.from({ length: VARIANT_COUNT }, () => {
      const p = mutate(center, rng, siblings, text);
      return { params: p, tags: describeDiff(p, center) };
    });
  }, [center, siblings, seed, text]);

  const edit = (p: Params, label: string) => {
    startEditing(p, label);
    go('edit');
  };

  const rootDir = trail[0] ? DIRECTIONS.find((d) => d.nameKo === trail[0].label) : undefined;

  return (
    <main className="screen explore">
      <header className="screen__head">
        <div>
          <p className="eyebrow">STEP 02 — 형태 탐색</p>
          <h1 className="screen__title">
            ‘{text}’의 조형 방향
          </h1>
          <p className="screen__lead">
            {center
              ? '기준 시안에서 조금씩 달라진 이웃 시안들입니다. 마음에 드는 곳을 중심으로 계속 탐색하거나, 바로 편집하세요.'
              : '일곱 가지 방향으로 같은 이름을 그려 봤어요. 앞의 셋은 글꼴이 아니라 자음·모음을 직접 조립한 실험 방향입니다. 끌리는 방향을 골라 주변을 더 탐색하거나, 바로 편집으로 넘어갈 수 있어요.'}
          </p>
        </div>
        <div className="screen__tools">
          {center && (
            <>
              <button className="btn btn--ghost" onClick={() => setExplore(center, siblings, trail, seed + 1)}>
                ↻ 다시 섞기
              </button>
              <button className="btn btn--ghost" onClick={() => setExplore(null, [], [], 1)}>
                처음 방향들로 돌아가기
              </button>
            </>
          )}
          <button className="btn btn--ghost" onClick={() => go('start')}>
            ← 이름 바꾸기
          </button>
        </div>
      </header>

      {center && trail.length > 0 && (
        <nav className="trail" aria-label="탐색 경로">
          <span className="trail__label">경로</span>
          {trail.map((t, i) => (
            <button
              key={i}
              type="button"
              className={i === trail.length - 1 ? 'trail__item is-current' : 'trail__item'}
              onClick={() => setExplore(t.params, siblings, trail.slice(0, i + 1), seed + 1)}
            >
              {i === 0 ? t.label : t.label}
            </button>
          ))}
        </nav>
      )}

      {!center ? (
        <div className="grid grid--dirs">
          {DIRECTIONS.map((d) => (
            <WordCard
              key={d.id}
              text={text}
              params={d.params}
              index={d.index}
              title={`${d.nameKo} · ${d.nameEn}`}
              tags={[d.note]}
              chip={d.experimental ? '실험' : undefined}
              actions={
                <>
                  <button
                    className="btn btn--primary"
                    onClick={() => setExplore(d.params, d.siblings, [{ label: d.nameKo, params: d.params }], 1)}
                  >
                    이 방향 탐색
                  </button>
                  <button className="btn btn--ghost" onClick={() => edit(d.params, d.nameKo)}>
                    바로 편집
                  </button>
                </>
              }
            />
          ))}
        </div>
      ) : (
        <div className="grid grid--variants">
          <WordCard
            text={text}
            params={center}
            index="◎"
            title={trail[trail.length - 1]?.label ?? '기준 시안'}
            pinned
            actions={
              <button
                className="btn btn--primary"
                onClick={() => edit(center, trail[trail.length - 1]?.label ?? '기준 시안')}
              >
                이 시안으로 편집
              </button>
            }
          />
          {variants.map((v, i) => {
            const label = v.tags.join(' · ');
            return (
              <WordCard
                key={`${seed}-${i}`}
                text={text}
                params={v.params}
                index={String(i + 1).padStart(2, '0')}
                title={label}
                actions={
                  <>
                    <button
                      className="btn btn--soft"
                      onClick={() =>
                        setExplore(
                          v.params,
                          siblings.length ? siblings : (rootDir?.siblings ?? directionOf('geometric').siblings),
                          [...trail, { label, params: v.params }],
                          seed + 1,
                        )
                      }
                    >
                      여기서 더 탐색
                    </button>
                    <button className="btn btn--ghost" onClick={() => edit(v.params, label)}>
                      편집
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
