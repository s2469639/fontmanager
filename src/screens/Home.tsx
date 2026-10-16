import { useEffect, useMemo, useState } from 'react';
import type { Params } from '../core/types';
import { DEFAULT_PARAMS } from '../core/defaults';
import { DIRECTIONS } from '../data/styles';
import { FONTS } from '../data/fonts';
import { MiniWord } from '../components/MiniWord';
import type { Route } from '../state/router';

const WORDS = ['형태', '한글', '고요', '다온'];

/** 글자 형태가 실제 엔진으로 계속 변하는 히어로. 굵기·폭·자간을 시간에 따라 움직입니다. */
function LiveWord() {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 40) return;
      last = now;
      setT((now - start) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const word = WORDS[Math.floor(t / 4) % WORDS.length];
  const params: Params = useMemo(
    () => ({
      ...DEFAULT_PARAMS,
      fontId: 'pretendard',
      weight: Math.round((0.5 + 0.5 * Math.sin(t * 0.9 - 1.2)) * 100) / 100,
      width: Math.round(100 + 28 * Math.sin(t * 0.6)),
      tracking: Math.round((0.04 + 0.05 * Math.sin(t * 0.45)) * 100) / 100,
    }),
    [t],
  );
  return <MiniWord text={word} params={params} pad={0.06} className="hero__svg" />;
}

const STEPS = [
  {
    n: '01',
    title: '이름 입력',
    desc: '브랜드나 프로젝트의 한글 이름을 적습니다.',
    params: { ...DEFAULT_PARAMS, weight: 0.4 },
  },
  {
    n: '02',
    title: '형태 탐색',
    desc: '같은 이름을 여러 조형 방향으로 비교하고, 마음에 드는 시안 주변을 더 탐색합니다.',
    params: DIRECTIONS[2].params,
  },
  {
    n: '03',
    title: '직접 조절',
    desc: '굵기, 폭, 자간, 모서리와 조형 효과를 움직이며 처음 시안과 비교합니다.',
    params: { ...DIRECTIONS[1].params, skewOn: true, skew: 12 },
  },
  {
    n: '04',
    title: 'PNG 저장',
    desc: '밝은·어두운 배경에서 확인하고 투명 배경 PNG로 저장합니다.',
    params: { ...DIRECTIONS[3].params },
  },
];

export function Home({ go }: { go: (r: Route) => void }) {
  return (
    <main className="home">
      <section className="hero">
        <p className="eyebrow">HANGUL FORM LAB — 한글 형태 연구소</p>
        <div className="hero__stage">
          <LiveWord />
        </div>
        <div className="hero__copy">
          <h1 className="hero__title">
            생성된 결과를 받아보는 경험에서,
            <br />
            <em>글자의 형태를 직접 디자인하는 경험으로.</em>
          </h1>
          <p className="hero__lead">
            한글을 입력하고 끝나는 로고 생성기가 아닙니다. 한글의 형태를 탐색하고, 굵기·폭·간격·모서리를
            직접 움직이며 나만의 워드마크를 만드는 인터랙티브 도구입니다.
          </p>
          <button className="btn btn--primary btn--xl" onClick={() => go('start')}>
            내 워드마크 만들기 <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">
          <span className="section__no">A</span> 탐색에서 저장까지
        </h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n} className="step">
              <div className="step__stage">
                <MiniWord text="고요" params={s.params} className="step__svg" />
              </div>
              <span className="step__n">{s.n}</span>
              <h3 className="step__title">{s.title}</h3>
              <p className="step__desc">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section">
        <h2 className="section__title">
          <span className="section__no">B</span> 네 가지 조형 방향
        </h2>
        <div className="dirs">
          {DIRECTIONS.map((d) => (
            <div key={d.id} className="dir">
              <div className="dir__stage">
                <MiniWord text="한글" params={d.params} className="dir__svg" />
              </div>
              <p className="dir__name">
                <span>{d.index}</span> {d.nameKo} <small>{d.nameEn}</small>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section--scope">
        <h2 className="section__title">
          <span className="section__no">C</span> 지금 할 수 있는 것, 아직 아닌 것
        </h2>
        <div className="scope">
          <div className="scope__col">
            <h3>지금 가능</h3>
            <ul>
              <li>글꼴, 굵기, 폭, 자간, 모서리 조절</li>
              <li>기울기·세로 비율·외곽선·겹침 효과</li>
              <li>시안 탐색과 주변 변주 보기</li>
              <li>처음 시안과 현재 결과 비교</li>
              <li>밝은/어두운 배경 확인, 투명 PNG 저장</li>
            </ul>
          </div>
          <div className="scope__col scope__col--later">
            <h3>준비 중 (아직 없음)</h3>
            <ul>
              <li>자음·모음 단위로 획의 형태 바꾸기</li>
              <li>심볼 결합</li>
              <li>브랜드 키워드 기반 조형 제안</li>
              <li>거칠게·물결·줄무늬 효과</li>
            </ul>
            <p className="scope__note">
              ‘폭’은 글자를 가로로 늘이고 줄이는 변형이며, 자소 구조를 다시 설계하는 기능이 아닙니다.
            </p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>
          사용한 글꼴은 모두 SIL Open Font License 1.1 (수정·재배포 허용):{' '}
          {FONTS.map((f, i) => (
            <span key={f.id}>
              <a href={f.source} target="_blank" rel="noreferrer">
                {f.name}
              </a>
              {i < FONTS.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      </footer>
    </main>
  );
}
