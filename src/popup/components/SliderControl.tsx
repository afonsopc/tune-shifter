import type React from "react";
import { useCallback } from "react";

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
  presets?: { label: string; value: number }[];
  nested?: boolean;
}

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  presets,
  nested = false,
}: SliderControlProps) {
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => onChange(parseFloat(e.currentTarget.value)),
    [onChange]
  );
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className={`row slider-row ${nested ? "nested" : ""}`}>
      <div className="row-line">
        <span className="row-label">{label}</span>
        <span className="row-value">{displayValue}</span>
      </div>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={handleInput}
        onChange={handleInput}
        aria-label={label}
        style={{ "--fill": `${pct}%` } as React.CSSProperties}
      />
      {presets && presets.length > 0 && (
        <div className="presets" role="group" aria-label={`${label} presets`}>
          {presets.map((p) => (
            <button
              key={p.label}
              className={Math.abs(value - p.value) < 0.005 ? "active" : ""}
              onClick={() => onChange(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
