import { useStore } from '../state/store';
import { LIMITS } from '../core/defaults';
import { FONTS, getFont } from '../data/fonts';
import { axisValue } from '../core/fontStore';
import { Segmented, Slider, EffectCard } from './Controls';
import type { Corner } from '../core/types';

const SWATCHES = ['#111111', '#ffffff', '#ff3b1d', '#1f3bff', '#0a8f5b', '#e8a900'];

export function ControlPanel() {
  const p = useStore((s) => s.params);
  const set = useStore((s) => s.setParams);
  const def = getFont(p.fontId);

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

        <EffectCard
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
        </EffectCard>

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
