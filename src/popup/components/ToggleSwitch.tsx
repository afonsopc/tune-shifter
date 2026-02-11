interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ label, checked, onChange }: ToggleSwitchProps) {
  return (
    <div className="toggle-control">
      <span className="toggle-label">{label}</span>
      <button
        className={`toggle-switch ${checked ? "on" : "off"}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
