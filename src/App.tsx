import { useEffect } from 'react';
import { useRoute } from './state/router';
import type { Route } from './state/router';
import { useStore } from './state/store';
import { Home } from './screens/Home';
import { Start } from './screens/Start';
import { Explore } from './screens/Explore';
import { Edit } from './screens/Edit';
import { Result } from './screens/Result';

const STEPS: { route: Route; no: string; label: string }[] = [
  { route: 'start', no: '01', label: '입력' },
  { route: 'explore', no: '02', label: '탐색' },
  { route: 'edit', no: '03', label: '편집' },
  { route: 'result', no: '04', label: '결과' },
];

export default function App() {
  const [route, go] = useRoute();
  const text = useStore((s) => s.text);
  const baseline = useStore((s) => s.baseline);

  // 앞 단계가 비어 있으면 가까운 단계로 돌려보냅니다.
  const needs: Route | null =
    (route === 'explore' || route === 'edit' || route === 'result') && !text
      ? 'start'
      : (route === 'edit' || route === 'result') && !baseline
        ? 'explore'
        : null;
  useEffect(() => {
    if (needs) go(needs);
  }, [needs, go]);

  const reachable = (r: Route) => r === 'start' || (r === 'explore' && !!text) || ((r === 'edit' || r === 'result') && !!text && !!baseline);

  return (
    <div className={`app app--${route}`}>
      <header className="topbar">
        <a
          className="topbar__logo"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            go('home');
          }}
        >
          HANGUL FORM LAB
        </a>
        {route !== 'home' && (
          <nav className="topbar__steps" aria-label="진행 단계">
            {STEPS.map((s) => (
              <button
                key={s.route}
                className={s.route === route ? 'stepnav is-current' : 'stepnav'}
                disabled={!reachable(s.route)}
                aria-current={s.route === route ? 'step' : undefined}
                onClick={() => go(s.route)}
              >
                <span>{s.no}</span> {s.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      {needs ? null : route === 'home' ? (
        <Home go={go} />
      ) : route === 'start' ? (
        <Start go={go} />
      ) : route === 'explore' ? (
        <Explore go={go} />
      ) : route === 'edit' ? (
        <Edit go={go} />
      ) : (
        <Result go={go} />
      )}
    </div>
  );
}
