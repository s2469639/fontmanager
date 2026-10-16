import type { ReactNode } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint?: string;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step, display, hint, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider__head">
        <span className="slider__label">{label}</span>
        <output className="slider__value">{display}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint && <span className="slider__hint">{hint}</span>}
    </label>
  );
}

interface SegProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegProps<T>) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'seg__btn is-on' : 'seg__btn'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface EffectProps {
  title: string;
  desc: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children?: ReactNode;
}

export function EffectCard({ title, desc, on, onToggle, children }: EffectProps) {
  return (
    <section className={on ? 'effect is-on' : 'effect'}>
      <button
        type="button"
        className="effect__head"
        role="switch"
        aria-checked={on}
        onClick={() => onToggle(!on)}
      >
        <span className="effect__titles">
          <span className="effect__title">{title}</span>
          <span className="effect__desc">{desc}</span>
        </span>
        <span className="switch" aria-hidden="true">
          <span className="switch__knob" />
        </span>
      </button>
      {on && children && <div className="effect__body">{children}</div>}
    </section>
  );
}
