import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { ChevronDownIcon } from '../primitives/Icons';
import './SelectMenu.css';

export default function SelectMenu({
  label,
  value,
  options,
  onChange,
  className = '',
  searchable = false,
  searchPlaceholder = 'Search options',
  emptyText = 'No matching options',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => String(option.value) === String(value)),
  );
  const selectedOption = options[selectedIndex];
  const visibleOptions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!searchable || !query) return options;
    return options.filter((option) =>
      String(option.searchText || `${option.label} ${option.meta || ''}`)
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [options, search, searchable]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
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
        onClick={() => {
          setOpen((current) => !current);
          setSearch('');
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedOption?.label}</span>
        <ChevronDownIcon className="select-menu-chevron" size={15} />
      </button>
      {open && (
        <div className="select-menu-popover">
          {searchable && (
            <label className="select-menu-search">
              <span className="sr-only">Search {label.toLocaleLowerCase()}</span>
              <input
                ref={searchRef}
                aria-controls={listboxId}
                placeholder={searchPlaceholder}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          <div className="select-menu-options" id={listboxId} role="listbox" aria-label={label}>
            {visibleOptions.map((option) => (
              <button
                aria-selected={String(option.value) === String(value)}
                className="select-menu-option"
                key={option.value}
                role="option"
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span>{option.label}</span>
                {option.meta && <small>{option.meta}</small>}
              </button>
            ))}
            {visibleOptions.length === 0 && <p className="select-menu-empty">{emptyText}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
