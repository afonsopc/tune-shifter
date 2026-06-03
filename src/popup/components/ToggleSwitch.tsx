interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  subtle?: boolean;
}

export function ToggleSwitch({
  label,
  checked,
  onChange,
  subtle = false,
}: ToggleSwitchProps) {
  return (
    <div className={`toggle-control ${subtle ? "subtle" : ""}`}>
      <span className="toggle-label">{label}</span>
      <button
        className={`toggle-switch ${checked ? "on" : "off"}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
