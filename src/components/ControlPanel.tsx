import { useStore } from '../state/store';
import { LIMITS } from '../core/defaults';
import { FONTS, getFont } from '../data/fonts';
import { axisValue } from '../core/fontStore';
import { Segmented, Slider, EffectCard } from './Controls';
import type { Cap, Corner, Engine, JamoParams, OShape } from '../core/types';

const SWATCHES = ['#111111', '#ffffff', '#ff3b1d', '#1f3bff', '#0a8f5b', '#e8a900'];

export function ControlPanel() {
  const p = useStore((s) => s.params);
  const set = useStore((s) => s.setParams);
  const def = getFont(p.fontId);

  const jamo = p.engine === 'jamo';
  const setJ = (patch: Partial<JamoParams>) => set({ jamo: { ...p.jamo, ...patch } });

  const weightDisplay =
    def.weight.kind === 'axis'
      ? `${axisValue(def, p.weight)}`
      : p.weight <= 0
        ? '원본'
        : `+${Math.round(p.weight * 100)}%`;

  return (
    <div className="panel">
      <section className="panel__section">
        <h2 className="panel__title">기본 조형</h2>

        <div className="field">
          <span className="field__label">글자 만드는 방식</span>
          <Segmented<Engine>
            label="글자 만드는 방식"
            value={p.engine}
            options={[
              { value: 'jamo', label: '자소 조립 (실험)' },
              { value: 'font', label: '글꼴' },
            ]}
            onChange={(v) => set({ engine: v })}
          />
          <p className="field__note">
            {jamo
              ? '글꼴 없이 자음·모음을 선으로 직접 조립합니다. 한글만 그릴 수 있고, 일부 조합은 어색할 수 있는 프로토타입입니다.'
              : '글꼴의 윤곽선을 불러와 굵기·폭·자간·모서리를 조절합니다.'}
          </p>
        </div>

        {jamo ? <JamoControls p={p} setJ={setJ} set={set} /> : <>
        <div className="field">
          <span className="field__label">글꼴</span>
          <div className="fontgrid" role="radiogroup" aria-label="글꼴">
            {FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={f.id === p.fontId}
                className={f.id === p.fontId ? 'fontbtn is-on' : 'fontbtn'}
                onClick={() => set({ fontId: f.id })}
                title={f.vibe}
              >
                {f.nameKo}
              </button>
            ))}
          </div>
          <p className="field__note">
            {def.vibe}. {def.coverageNote}.{' '}
            <a href={def.source} target="_blank" rel="noreferrer">
              {def.license}
            </a>
          </p>
        </div>

        <Slider
          label="굵기"
          value={p.weight}
          {...LIMITS.weight}
          display={weightDisplay}
          hint={
            def.weight.kind === 'axis'
              ? '가변 글꼴의 굵기 축을 조절합니다. 글꼴이 설계한 실제 굵기입니다.'
              : '고정 글꼴이라 외곽선을 덧붙여 굵어 보이게 합니다. (근사)'
          }
          onChange={(v) => set({ weight: v })}
        />
        <Slider
          label="폭"
          value={p.width}
          {...LIMITS.width}
          display={`${p.width}%`}
          hint="글자를 가로로 늘이거나 줄입니다. 자음·모음의 구조가 바뀌는 것은 아닙니다."
          onChange={(v) => set({ width: v })}
        />
        <Slider
          label="자간"
          value={p.tracking}
          {...LIMITS.tracking}
          display={`${p.tracking >= 0 ? '+' : ''}${p.tracking.toFixed(2)}em`}
          onChange={(v) => set({ tracking: v })}
        />

        <div className="field">
          <span className="field__label">모서리</span>
          <Segmented<Corner>
            label="모서리"
            value={p.corner}
            options={[
              { value: 'sharp', label: '원본' },
              { value: 'round', label: '둥글게' },
              { value: 'bevel', label: '깎기' },
            ]}
            onChange={(v) => set({ corner: v })}
          />
          {p.corner !== 'sharp' && (
            <Slider
              label="강도"
              value={p.cornerAmount}
              {...LIMITS.cornerAmount}
              display={`${Math.round(p.cornerAmount * 100)}%`}
              hint={
                def.weight.kind === 'axis'
                  ? '외곽선에 선을 덧대어 다듬고, 굵기 축을 낮춰 굵기를 유지합니다.'
                  : '외곽선에 선을 덧대어 다듬습니다. 고정 글꼴이라 글자가 굵어집니다.'
              }
              onChange={(v) => set({ cornerAmount: v })}
            />
          )}
        </div>
        </>}
      </section>

      <section className="panel__section">
        <h2 className="panel__title">조형 효과</h2>

        <EffectCard
          title="기울기"
          desc="글자 전체를 기울입니다"
          on={p.skewOn}
          onToggle={(on) => set({ skewOn: on })}
        >
          <Slider
            label="각도"
            value={p.skew}
            {...LIMITS.skew}
            display={`${p.skew}°`}
            onChange={(v) => set({ skew: v })}
          />
        </EffectCard>

        <EffectCard
          title="세로 비율"
          desc="납작하게 누르거나 길게 늘입니다"
          on={p.vScaleOn}
          onToggle={(on) => set({ vScaleOn: on })}
        >
          <Slider
            label="세로"
            value={p.vScale}
            {...LIMITS.vScale}
            display={`${p.vScale}%`}
            onChange={(v) => set({ vScale: v })}
          />
        </EffectCard>

        {!jamo && <EffectCard
          title="외곽선만"
          desc="속을 비우고 테두리선만 남깁니다"
          on={p.outlineOn}
          onToggle={(on) => set({ outlineOn: on })}
        >
          <Slider
            label="선 굵기"
            value={p.outlineWidth}
            {...LIMITS.outlineWidth}
            display={`${(p.outlineWidth * 100).toFixed(1)}%`}
            onChange={(v) => set({ outlineWidth: v })}
          />
        </EffectCard>}

        <EffectCard
          title="겹침"
          desc="글자끼리 포개고, 겹친 곳이 진하게 비칩니다"
          on={p.overlapOn}
          onToggle={(on) => set({ overlapOn: on })}
        >
          <Slider
            label="겹치는 정도"
            value={p.overlapAmount}
            {...LIMITS.overlapAmount}
            display={`${Math.round(p.overlapAmount * 100)}%`}
            onChange={(v) => set({ overlapAmount: v })}
          />
          <Slider
            label="투명도"
            value={p.overlapOpacity}
            {...LIMITS.overlapOpacity}
            display={`${Math.round(p.overlapOpacity * 100)}%`}
            onChange={(v) => set({ overlapOpacity: v })}
          />
        </EffectCard>
      </section>

      <section className="panel__section">
        <h2 className="panel__title">색상</h2>
        <div className="swatches">
          <button
            type="button"
            className={p.color === 'auto' ? 'swatch swatch--auto is-on' : 'swatch swatch--auto'}
            onClick={() => set({ color: 'auto' })}
            title="배경에 맞춰 검정/흰색"
          >
            자동
          </button>
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={p.color === c ? 'swatch is-on' : 'swatch'}
              style={{ background: c }}
              onClick={() => set({ color: c })}
              aria-label={`색상 ${c}`}
            />
          ))}
          <label className="swatch swatch--custom" title="직접 고르기">
            <input
              type="color"
              value={p.color === 'auto' ? '#111111' : p.color}
              onChange={(e) => set({ color: e.target.value })}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

interface JamoControlsProps {
  p: import('../core/types').Params;
  setJ: (patch: Partial<JamoParams>) => void;
  set: (patch: Partial<import('../core/types').Params>) => void;
}

function JamoControls({ p, setJ, set }: JamoControlsProps) {
  const j = p.jamo;
  return (
    <>
      <Slider
        label="선 굵기"
        value={j.strokeW}
        {...LIMITS.strokeW}
        display={`${(j.strokeW * 100).toFixed(1)}%`}
        hint="모든 획이 같은 굵기의 선입니다."
        onChange={(v) => setJ({ strokeW: v })}
      />
      <div className="field">
        <span className="field__label">선 끝</span>
        <Segmented<Cap>
          label="선 끝"
          value={j.cap}
          options={[
            { value: 'round', label: '둥글게' },
            { value: 'butt', label: '평평하게' },
            { value: 'square', label: '각지게' },
          ]}
          onChange={(v) => setJ({ cap: v })}
        />
      </div>
      <Slider
        label="꺾임 둥글기"
        value={j.roundness}
        {...LIMITS.roundness}
        display={`${Math.round(j.roundness * 100)}%`}
        hint="ㄱ, ㄴ 같은 꺾이는 곳을 곡선으로 만듭니다. 굵기는 그대로입니다."
        onChange={(v) => setJ({ roundness: v })}
      />
      <Slider
        label="초성 크기"
        value={j.consonantScale}
        {...LIMITS.consonantScale}
        display={`${Math.round(j.consonantScale * 100)}%`}
        onChange={(v) => setJ({ consonantScale: v })}
      />
      <Slider
        label="모음 크기"
        value={j.vowelScale}
        {...LIMITS.vowelScale}
        display={`${Math.round(j.vowelScale * 100)}%`}
        onChange={(v) => setJ({ vowelScale: v })}
      />
      <Slider
        label="초성·모음 간격"
        value={j.gap}
        {...LIMITS.gap}
        display={`${j.gap > 0 ? '+' : ''}${j.gap}`}
        onChange={(v) => setJ({ gap: v })}
      />
      <div className="field">
        <span className="field__label">ㅇ의 모양</span>
        <Segmented<OShape>
          label="ㅇ의 모양"
          value={j.oShape}
          options={[
            { value: 'circle', label: '원' },
            { value: 'square', label: '네모' },
            { value: 'diamond', label: '마름모' },
          ]}
          onChange={(v) => setJ({ oShape: v })}
        />
      </div>
      <Slider
        label="ㅇ 열기"
        value={j.circleGap}
        {...LIMITS.circleGap}
        display={j.circleGap <= 0.04 ? '닫힘' : `${Math.round(j.circleGap * 100)}%`}
        hint="ㅇ과 ㅎ의 고리에 틈을 냅니다."
        onChange={(v) => setJ({ circleGap: v })}
      />
      <Slider
        label="위아래 어긋남"
        value={j.bounce}
        {...LIMITS.bounce}
        display={`${(j.bounce * 100).toFixed(1)}%`}
        hint="글자가 번갈아 위아래로 움직입니다."
        onChange={(v) => setJ({ bounce: v })}
      />
      <Slider
        label="폭"
        value={p.width}
        {...LIMITS.width}
        display={`${p.width}%`}
        hint="글자를 가로로 늘이거나 줄입니다. 선 두께는 그대로입니다."
        onChange={(v) => set({ width: v })}
      />
      <Slider
        label="자간"
        value={p.tracking}
        {...LIMITS.tracking}
        display={`${p.tracking >= 0 ? '+' : ''}${p.tracking.toFixed(2)}em`}
        onChange={(v) => set({ tracking: v })}
      />
    </>
  );
}
