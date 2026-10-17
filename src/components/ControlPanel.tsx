import { useState } from 'react';
import { useStore } from '../state/store';
import { isJamoDrawable, partsOf, partVariantChar, previewPath, selectableJamoIn, variantNames } from '../core/jamo';
import { SkeletonEditor } from './SkeletonEditor';
import { LIMITS } from '../core/defaults';
import { FONTS, getFont } from '../data/fonts';
import { axisValue } from '../core/fontStore';
import { Segmented, Slider, EffectCard } from './Controls';
import type { BulgeScope, Cap, Corner, Engine, FxParams, GlyphOverride, HookStyle, JamoParams, LinkMode, OShape, Params, PartAdjust, WaveAxis } from '../core/types';

const PLATE_SWATCHES = ['#2d5bff', '#ff3b1d', '#ffd400', '#111111', '#ff5c93', '#0a8f5b', '#f2efe8'];
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

      {jamo && (
        <section className="panel__section">
          <h2 className="panel__title">자소 모양 (전체 적용)</h2>
          <ShapePicker p={p} set={set} />
        </section>
      )}

      {jamo && (
        <section className="panel__section">
          <h2 className="panel__title">뼈대 직접 그리기</h2>
          <SkeletonEditor p={p} set={set} />
        </section>
      )}

      {jamo && (
        <section className="panel__section">
          <h2 className="panel__title">글자별 편집</h2>
          <GlyphEditor p={p} set={set} />
        </section>
      )}

      <section className="panel__section">
        <h2 className="panel__title">조형 효과</h2>

        <EffectCard
          title="배경 판"
          desc="글자 뒤에 색 판을 깝니다 (앱 아이콘·배지 느낌)"
          on={p.plate.on}
          onToggle={(on) => set({ plate: { ...p.plate, on } })}
        >
          <Segmented<'rect' | 'ellipse'>
            label="판 모양"
            value={p.plate.shape}
            options={[
              { value: 'rect', label: '사각형' },
              { value: 'ellipse', label: '타원·원' },
            ]}
            onChange={(v) => set({ plate: { ...p.plate, shape: v } })}
          />
          <div style={{ height: 10 }} />
          {p.plate.shape === 'rect' && (
            <Slider
              label="모서리 둥글기"
              value={p.plate.radius}
              min={0}
              max={1}
              step={0.01}
              display={p.plate.radius <= 0.01 ? '각짐' : p.plate.radius >= 0.99 ? '알약' : `${Math.round(p.plate.radius * 100)}%`}
              onChange={(v) => set({ plate: { ...p.plate, radius: v } })}
            />
          )}
          <Slider
            label="좌우 여백"
            value={p.plate.padX}
            {...LIMITS.platePad}
            display={`${Math.round(p.plate.padX * 100)}%`}
            onChange={(v) => set({ plate: { ...p.plate, padX: v } })}
          />
          <Slider
            label="상하 여백"
            value={p.plate.padY}
            {...LIMITS.platePad}
            display={`${Math.round(p.plate.padY * 100)}%`}
            onChange={(v) => set({ plate: { ...p.plate, padY: v } })}
          />
          <label className="presetbox__check">
            <input
              type="checkbox"
              checked={p.plate.square}
              onChange={(e) => set({ plate: { ...p.plate, square: e.target.checked } })}
            />
            정사각형(정원)으로 맞추기
          </label>
          <div className="swatches" style={{ marginTop: 10 }} role="group" aria-label="판 색">
            {PLATE_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={p.plate.color === c ? 'swatch is-on' : 'swatch'}
                style={{ background: c }}
                onClick={() => set({ plate: { ...p.plate, color: c } })}
                aria-label={`판 색 ${c}`}
              />
            ))}
            <label className="swatch swatch--custom" title="판 색 직접 고르기">
              <input
                type="color"
                value={p.plate.color}
                onChange={(e) => set({ plate: { ...p.plate, color: e.target.value } })}
              />
            </label>
          </div>
          <p className="field__note">글자색이 '자동'이면 판과 잘 대비되는 흰색/검정으로 정해져요.</p>
        </EffectCard>

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

        <FxCards p={p} set={set} />
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
  p: Params;
  setJ: (patch: Partial<JamoParams>) => void;
  set: (patch: Partial<Params>) => void;
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
      <Slider
        label="굵기 대비"
        value={j.contrast}
        {...LIMITS.contrast}
        display={j.contrast === 0 ? '없음' : `${j.contrast > 0 ? '세로 굵게' : '가로 굵게'} ${Math.round(Math.abs(j.contrast) * 100)}%`}
        hint="가로획은 가늘게, 세로획은 굵게 해서 명조 같은 리듬을 줍니다. 음수(−)로 하면 반대예요. ㅇ 같은 곡선은 굵기가 부드럽게 변해요."
        onChange={(v) => setJ({ contrast: v })}
      />
      <Slider
        label="끝 가늘게 (붓 느낌)"
        value={j.taper}
        {...LIMITS.taper}
        display={j.taper <= 0.01 ? '없음' : `${Math.round(j.taper * 100)}%`}
        hint="획이 끝나는 곳이 서서히 가늘어져요. 굵기 대비와 함께 쓰면 붓글씨 같아져요."
        onChange={(v) => setJ({ taper: v })}
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
        label="부리 (시작)"
        value={j.hookStart}
        {...LIMITS.hook}
        display={j.hookStart <= 0.01 ? '없음' : `${Math.round(j.hookStart * 100)}%`}
        hint="획이 시작하는 곳을 작게 꺾어요. 명조체의 부리 같은 느낌이에요. 다른 획에 닿은 끝에는 붙지 않아요."
        onChange={(v) => setJ({ hookStart: v })}
      />
      <Slider
        label="부리 (끝)"
        value={j.hookEnd}
        {...LIMITS.hook}
        display={j.hookEnd <= 0.01 ? '없음' : `${Math.round(j.hookEnd * 100)}%`}
        hint="획이 끝나는 곳을 작게 꺾어요."
        onChange={(v) => setJ({ hookEnd: v })}
      />
      {(j.hookStart > 0.01 || j.hookEnd > 0.01) && (
        <div className="field">
          <span className="field__label">부리 모양</span>
          <Segmented<HookStyle>
            label="부리 모양"
            value={j.hookStyle}
            options={[
              { value: 'tick', label: '직각으로 꺾기' },
              { value: 'beak', label: '비스듬한 부리' },
            ]}
            onChange={(v) => setJ({ hookStyle: v })}
          />
          <label className="presetbox__check">
            <input type="checkbox" checked={j.hookFlip} onChange={(e) => setJ({ hookFlip: e.target.checked })} />
            꺾이는 쪽 반대로
          </label>
        </div>
      )}
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
      <Slider
        label="획 연결"
        value={j.link}
        {...LIMITS.link}
        display={j.link <= 0.01 ? '끔' : `${Math.round(j.link * 100)}%`}
        hint="가까이 있는 초성·모음·받침을 선으로 이어 줍니다. 값이 클수록 먼 곳까지 이어요."
        onChange={(v) => setJ({ link: v })}
      />
      {j.link > 0.01 && (
        <div className="field">
          <span className="field__label">연결 방식</span>
          <Segmented<LinkMode>
            label="연결 방식"
            value={j.linkMode}
            options={[
              { value: 'bridge', label: '직선 잇기' },
              { value: 'curve', label: '곡선 잇기' },
              { value: 'snap', label: '붙이기' },
              { value: 'flow', label: '한 획' },
            ]}
            onChange={(v) => setJ({ linkMode: v })}
          />
          <p className="field__note">
            {j.linkMode === 'snap'
              ? '자소를 살짝 움직여 서로 닿게 합니다. 가까운 곳만 붙습니다.'
              : j.linkMode === 'flow'
                ? '획의 끝과 끝(닫힌 ㅇ은 한 곳을 풀어서)을 방향이 맞게 이어 펜을 떼지 않은 듯 한 줄로 합칩니다. 방향이 맞지 않는 곳은 잇지 않아요.'
                : '끊어진 두 곳 사이에 선을 하나 더 긋습니다.'}
          </p>
        </div>
      )}
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
        display={`${j.bounce > 0 ? '+' : ''}${(j.bounce * 100).toFixed(1)}%`}
        hint="글자가 번갈아 위아래로 움직입니다. 음수(−)로 내리면 첫 글자가 아래로 시작하는 반대 방향이에요."
        onChange={(v) => setJ({ bounce: v })}
      />
      <Slider
        label="손글씨 흔들림"
        value={j.wobble}
        {...LIMITS.wobble}
        display={j.wobble <= 0.01 ? '없음' : `${Math.round(j.wobble * 100)}%`}
        hint="자음·모음마다 기울기·크기·위치가 조금씩 다르고, 선의 점도 살짝 흔들려서 손으로 쓴 느낌이 납니다. 같은 글자도 자리마다 다르게 흔들려요."
        onChange={(v) => setJ({ wobble: v })}
      />
      {j.wobble > 0.01 && (
        <div className="artactions" style={{ marginBottom: 10 }}>
          <button type="button" className="btn btn--soft" onClick={() => setJ({ wobbleSeed: (j.wobbleSeed % 9999) + 1 })}>
            다시 흔들기 ({j.wobbleSeed})
          </button>
        </div>
      )}
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

type PartKey = 'L' | 'V' | 'T';
const PART_LABEL: Record<PartKey, string> = { L: '초성', V: '모음', T: '받침' };

/** 선택한 글자의 초성·모음·받침을 따로 조절합니다. 전체 설정 위에 덧씌워집니다. */
function GlyphEditor({ p, set }: { p: Params; set: (patch: Partial<Params>) => void }) {
  const text = useStore((s) => s.text);
  const sel = useStore((s) => s.selectedGlyph);
  const select = useStore((s) => s.selectGlyph);
  const [part, setPart] = useState<PartKey>('L');

  const chars = Array.from(text).filter(isJamoDrawable);
  const idx = sel !== null && sel < chars.length ? sel : null;
  const edited = (i: number) => p.glyphs[i] !== undefined;
  const anyEdited = Object.keys(p.glyphs).length > 0;

  if (chars.length === 0) return <p className="field__note">자소 조립 모드에서 그릴 수 있는 한글이 없어요.</p>;

  const info = idx !== null ? partsOf(chars[idx]) : null;
  const ov: GlyphOverride = idx !== null ? (p.glyphs[idx] ?? {}) : {};
  const write = (next: GlyphOverride) => {
    if (idx === null) return;
    const glyphs = { ...p.glyphs };
    if (Object.keys(next).length === 0) delete glyphs[idx];
    else glyphs[idx] = next;
    set({ glyphs });
  };
  const available = (['L', 'V', 'T'] as PartKey[]).filter((k) => info && info[k]);
  const activePart: PartKey = available.includes(part) ? part : (available[0] ?? 'L');
  const adj: Partial<PartAdjust> = ov[activePart] ?? {};
  const setAdj = (patch: Partial<PartAdjust>) => write({ ...ov, [activePart]: { ...adj, ...patch } });

  return (
    <>
      <p className="field__note" style={{ marginTop: 0, marginBottom: 10 }}>
        글자를 눌러 고르면(미리보기에서 눌러도 돼요) 그 글자의 초성·모음·받침을 따로 바꿀 수 있어요.
      </p>
      <div className="glyphchips" role="listbox" aria-label="글자 선택">
        {chars.map((c, i) => (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={idx === i}
            className={idx === i ? 'glyphchip is-on' : 'glyphchip'}
            onClick={() => select(idx === i ? null : i)}
          >
            {c}
            {edited(i) && <span className="glyphchip__dot" aria-label="수정됨" />}
          </button>
        ))}
      </div>

      {idx !== null && info && (
        <div className="glypheditor">
          <Segmented<PartKey>
            label="부분 선택"
            value={activePart}
            options={available.map((k) => ({ value: k, label: `${PART_LABEL[k]} ${info[k]}` }))}
            onChange={setPart}
          />
          <div style={{ height: 14 }} />
          {(() => {
            const partChar = info[activePart];
            const vc = partChar ? partVariantChar(partChar) : undefined;
            if (!vc) return null;
            const key = (activePart + 'v') as 'Lv' | 'Vv' | 'Tv';
            const cur = ov[key];
            return (
              <div className="field">
                <span className="field__label">이 글자의 {vc} 모양</span>
                <div className="shaperow__opts" role="radiogroup" aria-label={`${vc} 모양 (이 글자만)`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={cur === undefined}
                    className={cur === undefined ? 'variantchip variantchip--text is-on' : 'variantchip variantchip--text'}
                    onClick={() => {
                      const next = { ...ov };
                      delete next[key];
                      write(next);
                    }}
                  >
                    <span>전체 설정</span>
                  </button>
                  {variantNames(vc).map((name, i) => (
                    <VariantChip key={name} ch={vc} idx={i} label={name} on={cur === i} onClick={() => write({ ...ov, [key]: i })} />
                  ))}
                </div>
              </div>
            );
          })()}
          <Slider
            label="크기"
            value={adj.scale ?? 1}
            min={0.15}
            max={3.5}
            step={0.01}
            display={`${Math.round((adj.scale ?? 1) * 100)}%`}
            onChange={(v) => setAdj({ scale: v })}
          />
          <Slider
            label="가로 이동"
            value={adj.dx ?? 0}
            min={-120}
            max={120}
            step={0.5}
            display={`${adj.dx ?? 0}`}
            onChange={(v) => setAdj({ dx: v })}
          />
          <Slider
            label="세로 이동"
            value={adj.dy ?? 0}
            min={-120}
            max={120}
            step={0.5}
            display={`${adj.dy ?? 0}`}
            onChange={(v) => setAdj({ dy: v })}
          />
          <Slider
            label="회전"
            value={adj.rot ?? 0}
            min={-180}
            max={180}
            step={1}
            display={`${adj.rot ?? 0}°`}
            onChange={(v) => setAdj({ rot: v })}
          />

          {info.hasRing && (
            <div className="field">
              <span className="field__label">이 글자의 ㅇ·ㅎ 고리</span>
              <Segmented<'default' | OShape>
                label="고리 모양"
                value={ov.oShape ?? 'default'}
                options={[
                  { value: 'default', label: '전체 설정' },
                  { value: 'circle', label: '원' },
                  { value: 'square', label: '네모' },
                  { value: 'diamond', label: '마름모' },
                ]}
                onChange={(v) => {
                  const next = { ...ov };
                  if (v === 'default') delete next.oShape;
                  else next.oShape = v;
                  write(next);
                }}
              />
              <div style={{ height: 12 }} />
              <Slider
                label="고리 열기"
                value={ov.circleGap ?? p.jamo.circleGap}
                {...LIMITS.circleGap}
                display={ov.circleGap === undefined ? '전체 설정' : ov.circleGap <= 0.04 ? '닫힘' : `${Math.round(ov.circleGap * 100)}%`}
                onChange={(v) => write({ ...ov, circleGap: v })}
              />
            </div>
          )}

          <Slider
            label="이 글자의 획 연결"
            value={ov.link ?? p.jamo.link}
            {...LIMITS.link}
            display={ov.link === undefined ? '전체 설정' : ov.link <= 0.01 ? '끔' : `${Math.round(ov.link * 100)}%`}
            hint="이 글자만 연결 정도를 따로 정합니다."
            onChange={(v) => write({ ...ov, link: v })}
          />
          <Slider
            label="이 글자의 선 굵기"
            value={ov.stroke ?? 1}
            min={0.15}
            max={6}
            step={0.05}
            display={`×${(ov.stroke ?? 1).toFixed(2)}`}
            hint="전체 선 굵기에 곱해집니다."
            onChange={(v) => write({ ...ov, stroke: v })}
          />
          <Slider
            label="이 글자의 손글씨 흔들림"
            value={ov.wobble ?? p.jamo.wobble}
            {...LIMITS.wobble}
            display={ov.wobble === undefined ? '전체 설정' : ov.wobble <= 0.01 ? '없음' : `${Math.round(ov.wobble * 100)}%`}
            onChange={(v) => write({ ...ov, wobble: v })}
          />
          <Slider
            label="이 글자의 부리 (시작)"
            value={ov.hookStart ?? p.jamo.hookStart}
            {...LIMITS.hook}
            display={ov.hookStart === undefined ? '전체 설정' : `${Math.round(ov.hookStart * 100)}%`}
            onChange={(v) => write({ ...ov, hookStart: v })}
          />
          <Slider
            label="이 글자의 부리 (끝)"
            value={ov.hookEnd ?? p.jamo.hookEnd}
            {...LIMITS.hook}
            display={ov.hookEnd === undefined ? '전체 설정' : `${Math.round(ov.hookEnd * 100)}%`}
            onChange={(v) => write({ ...ov, hookEnd: v })}
          />
          <Slider
            label="이 글자의 붓 끝 가늘기"
            value={ov.taper ?? p.jamo.taper}
            {...LIMITS.taper}
            display={ov.taper === undefined ? '전체 설정' : `${Math.round(ov.taper * 100)}%`}
            hint="이 글자만 획 끝을 붓처럼 가늘게 합니다."
            onChange={(v) => write({ ...ov, taper: v })}
          />
          <button
            type="button"
            className="btn btn--soft"
            disabled={idx === null || !edited(idx)}
            onClick={() => write({})}
          >
            이 글자 되돌리기
          </button>
        </div>
      )}
      {anyEdited && (
        <button type="button" className="btn btn--ghost" style={{ marginTop: 8 }} onClick={() => set({ glyphs: {} })}>
          모든 글자 수정 되돌리기
        </button>
      )}
    </>
  );
}

/** 뼈대 모양 하나를 보여 주는 작은 미리보기 버튼 */
function VariantChip({ ch, idx, label, on, onClick }: { ch: string; idx: number; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${ch} ${label}`}
      title={label}
      className={on ? 'variantchip is-on' : 'variantchip'}
      onClick={onClick}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path
          d={previewPath(ch, idx)}
          fill="none"
          stroke="currentColor"
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

/** 텍스트에 쓰인 자모마다 뼈대 모양을 고릅니다. 같은 자모가 쓰인 모든 글자에 적용됩니다. */
function ShapePicker({ p, set }: { p: Params; set: (patch: Partial<Params>) => void }) {
  const text = useStore((s) => s.text);
  const chars = selectableJamoIn(text);
  if (chars.length === 0) return <p className="field__note">이 이름에는 모양을 고를 수 있는 자모가 없어요.</p>;
  const choose = (c: string, i: number) => {
    const variants = { ...p.variants };
    if (i === 0) delete variants[c];
    else variants[c] = i;
    // 기본 모양을 고르면 직접 그린 뼈대는 쓰지 않습니다.
    const skeletons = { ...p.skeletons };
    delete skeletons[c];
    set({ variants, skeletons });
  };
  return (
    <>
      <p className="field__note" style={{ marginTop: 0, marginBottom: 10 }}>
        자음·모음의 뼈대 모양을 고르면 그 자모가 들어간 모든 글자가 바뀌어요. 글자 하나만 바꾸려면 아래 ‘글자별 편집’을 쓰세요.
      </p>
      {chars.map((c) => (
        <div className="shaperow" key={c}>
          <span className="shaperow__ch">{c}</span>
          <div className="shaperow__opts" role="radiogroup" aria-label={`${c} 모양`}>
            {variantNames(c).map((name, i) => (
              <VariantChip
                key={name}
                ch={c}
                idx={i}
                label={name}
                on={!p.skeletons[c] && (p.variants[c] ?? 0) === i}
                onClick={() => choose(c, i)}
              />
            ))}
            {p.skeletons[c] && (
              <span className="variantchip variantchip--text is-on" aria-label={`${c} 직접 그린 모양 사용 중`}>
                <span>직접 그림</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

/** 거칠게 · 물결 · 부풀림 · 줄무늬 — 글꼴/자소 조립 어느 쪽에도 적용되는 형태 변형 효과 */
function FxCards({ p, set }: { p: Params; set: (patch: Partial<Params>) => void }) {
  const fx = p.fx;
  const setFx = (patch: Partial<FxParams>) => set({ fx: { ...fx, ...patch } });
  return (
    <>
      <EffectCard
        title="거칠게"
        desc="윤곽이 손으로 오린 듯 울퉁불퉁해집니다"
        on={fx.roughOn}
        onToggle={(on) => setFx({ roughOn: on })}
      >
        <Slider
          label="거친 정도"
          value={fx.roughAmp}
          {...LIMITS.roughAmp}
          display={`${(fx.roughAmp * 100).toFixed(1)}%`}
          onChange={(v) => setFx({ roughAmp: v })}
        />
        <Slider
          label="떨림의 크기"
          value={fx.roughScale}
          {...LIMITS.roughScale}
          display={`${(fx.roughScale * 100).toFixed(1)}%`}
          hint="작을수록 잔잔하게 떨리고, 클수록 크게 일렁입니다."
          onChange={(v) => setFx({ roughScale: v })}
        />
        <Slider
          label="무늬 바꾸기"
          value={fx.roughSeed}
          {...LIMITS.roughSeed}
          display={`#${fx.roughSeed}`}
          onChange={(v) => setFx({ roughSeed: v })}
        />
      </EffectCard>

      <EffectCard
        title="물결"
        desc="글자 전체가 파도처럼 일렁입니다"
        on={fx.waveOn}
        onToggle={(on) => setFx({ waveOn: on })}
      >
        <div className="field">
          <span className="field__label">방향</span>
          <Segmented<WaveAxis>
            label="물결 방향"
            value={fx.waveAxis}
            options={[
              { value: 'y', label: '위아래' },
              { value: 'x', label: '좌우' },
              { value: 'both', label: '둘 다' },
            ]}
            onChange={(v) => setFx({ waveAxis: v })}
          />
        </div>
        <Slider
          label="높이"
          value={fx.waveAmp}
          {...LIMITS.waveAmp}
          display={`${(fx.waveAmp * 100).toFixed(1)}%`}
          onChange={(v) => setFx({ waveAmp: v })}
        />
        <Slider
          label="물결 길이"
          value={fx.waveLen}
          {...LIMITS.waveLen}
          display={`${fx.waveLen.toFixed(2)}em`}
          onChange={(v) => setFx({ waveLen: v })}
        />
        <Slider
          label="위상"
          value={fx.wavePhase}
          {...LIMITS.wavePhase}
          display={`${fx.wavePhase}°`}
          onChange={(v) => setFx({ wavePhase: v })}
        />
      </EffectCard>

      <EffectCard
        title="부풀림"
        desc="가운데가 볼록하게 부풀거나 오므라듭니다"
        on={fx.bulgeOn}
        onToggle={(on) => setFx({ bulgeOn: on })}
      >
        <div className="field">
          <span className="field__label">적용 범위</span>
          <Segmented<BulgeScope>
            label="부풀림 범위"
            value={fx.bulgeScope}
            options={[
              { value: 'glyph', label: '글자마다' },
              { value: 'word', label: '단어 전체' },
            ]}
            onChange={(v) => setFx({ bulgeScope: v })}
          />
        </div>
        <Slider
          label="세기"
          value={fx.bulgeAmount}
          {...LIMITS.bulgeAmount}
          display={`${fx.bulgeAmount > 0 ? '+' : ''}${Math.round(fx.bulgeAmount * 100)}%`}
          hint="양수는 부풀리고 음수는 오므립니다."
          onChange={(v) => setFx({ bulgeAmount: v })}
        />
      </EffectCard>

      <EffectCard
        title="줄무늬 잘라내기"
        desc="글자를 가는 띠로 잘라 틈을 냅니다"
        on={fx.stripeOn}
        onToggle={(on) => setFx({ stripeOn: on })}
      >
        <Slider
          label="줄 수"
          value={fx.stripeCount}
          {...LIMITS.stripeCount}
          display={`${fx.stripeCount}줄`}
          onChange={(v) => setFx({ stripeCount: v })}
        />
        <Slider
          label="잘라내는 비율"
          value={fx.stripeGap}
          {...LIMITS.stripeGap}
          display={`${Math.round(fx.stripeGap * 100)}%`}
          onChange={(v) => setFx({ stripeGap: v })}
        />
        <Slider
          label="각도"
          value={fx.stripeAngle}
          {...LIMITS.stripeAngle}
          display={`${fx.stripeAngle}°`}
          hint="0°는 가로줄, 90°는 세로줄입니다."
          onChange={(v) => setFx({ stripeAngle: v })}
        />
        <Slider
          label="위치 옮기기"
          value={fx.stripePhase}
          {...LIMITS.stripePhase}
          display={`${Math.round(fx.stripePhase * 100)}%`}
          onChange={(v) => setFx({ stripePhase: v })}
        />
      </EffectCard>
    </>
  );
}
