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
}: SliderControlProps) {
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange]
  );

  // Calculate fill percentage for the track
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="slider-control" data-label={label}>
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{displayValue}</span>
      </div>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={handleInput}
        style={
          {
            "--fill-pct": `${pct}%`,
          } as React.CSSProperties
        }
      />
      {presets && presets.length > 0 && (
        <div className="slider-presets">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className={`preset-btn ${Math.abs(value - preset.value) < 0.01 ? "active" : ""}`}
              onClick={() => onChange(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
