import { useEffect, useId, useRef, useState } from 'react';

import { ChevronDownIcon } from '../primitives/Icons';

export default function SelectMenu({ label, value, options, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => String(option.value) === String(value)));
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const moveSelection = (offset) => {
    const nextIndex = (selectedIndex + offset + options.length) % options.length;
    onChange(options[nextIndex].value);
    setOpen(true);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      onChange(options[event.key === 'Home' ? 0 : options.length - 1].value);
      setOpen(true);
    }
  };

  return (
    <div className={`select-menu ${className}`.trim()} ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className="select-menu-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedOption?.label}</span>
        <ChevronDownIcon className="select-menu-chevron" size={15} />
      </button>
      {open && (
        <div className="select-menu-options" id={listboxId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              aria-selected={String(option.value) === String(value)}
              className="select-menu-option"
              key={option.value}
              role="option"
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
