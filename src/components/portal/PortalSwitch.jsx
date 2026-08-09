export default function PortalSwitch({ label, checked, onChange, disabled = false, description = "" }) {
  return (
    <div className="portal-switch-row">
      <span className="portal-switch-copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <button
        className="portal-switch"
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span aria-hidden="true" />
        <small aria-hidden="true">{checked ? "ON" : "OFF"}</small>
      </button>
    </div>
  );
}
