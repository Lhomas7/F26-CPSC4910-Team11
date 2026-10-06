import { useState } from 'react';

import './PasswordInput.css';

// Password input with a Show/Hide toggle. Render the <label> yourself and
// point it at `id`; `label` is only used to name the toggle button.
// Visibility is tracked internally unless `visible` and `onToggleVisible`
// are passed, which lets a parent reset it or share it between fields.
export default function PasswordInput({
  id,
  label,
  className = '',
  visible: controlledVisible,
  onToggleVisible,
  disabled,
  ...inputProps
}) {
  const [ownVisible, setOwnVisible] = useState(false);
  const controlled = controlledVisible !== undefined;
  const visible = controlled ? controlledVisible : ownVisible;
  const toggle = controlled ? onToggleVisible : () => setOwnVisible((current) => !current);

  return (
    <div className="password-input">
      <input
        {...inputProps}
        id={id}
        className={`password-input-field ${className}`.trim()}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        aria-pressed={visible}
        disabled={disabled}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
