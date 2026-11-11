interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A whole-row switch: the label is part of the tap target. */
export function ToggleSwitch({ label, checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      className="row toggle-row"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="row-label">{label}</span>
      <span className={`switch ${checked ? "on" : ""}`} aria-hidden>
        <span className="knob" />
      </span>
    </button>
  );
}
