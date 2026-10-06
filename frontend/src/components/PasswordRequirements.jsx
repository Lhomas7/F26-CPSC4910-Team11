import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import * as api from '../api';
import './PasswordRequirements.css';

const POPOVER_WIDTH = 288;
const GAP = 12;
const EDGE = 16;

// Place the popover beside the field when there is room, otherwise below the
// toggle. Fixed positioning keeps it clear of cards that clip overflow.
function placement(field, toggle) {
  const fieldRect = field.getBoundingClientRect();
  const toggleRect = toggle.getBoundingClientRect();
  if (window.innerWidth - fieldRect.right >= POPOVER_WIDTH + GAP + EDGE) {
    return { top: fieldRect.top, left: fieldRect.right + GAP, width: POPOVER_WIDTH };
  }
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - EDGE * 2);
  return {
    top: toggleRect.bottom + 6,
    left: Math.max(EDGE, Math.min(toggleRect.left, window.innerWidth - width - EDGE)),
    width,
  };
}

export default function PasswordRequirements() {
  const popoverId = useId();
  const wrapperRef = useRef(null);
  const toggleRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [policy, setPolicy] = useState({ status: 'idle', requirements: [], symbols: '' });
  const [position, setPosition] = useState(null);

  const reposition = useCallback(() => {
    // The component sits inside the field it describes, so its parent is the field.
    const field = wrapperRef.current?.parentElement;
    if (field && toggleRef.current) setPosition(placement(field, toggleRef.current));
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const closeOnOutsideClick = (event) => {
      if (
        !wrapperRef.current?.contains(event.target)
        && !popoverRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open || policy.status !== 'idle') return;
    setPolicy((current) => ({ ...current, status: 'loading' }));
    api.passwordPolicy()
      .then((data) => setPolicy({
        status: 'ready',
        requirements: data.requirements || [],
        symbols: data.special_characters || '',
      }))
      .catch(() => setPolicy({ status: 'error', requirements: [], symbols: '' }));
  }, [open, policy.status]);

  return (
    <div className="password-reqs" ref={wrapperRef}>
      <button
        ref={toggleRef}
        type="button"
        className="password-reqs-toggle"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? 'Hide password requirements' : 'Show password requirements'}
      </button>
      {open && (
        <div
          id={popoverId}
          ref={popoverRef}
          className="password-reqs-popover"
          role="dialog"
          aria-label="Password requirements"
          style={position || undefined}
        >
          <p className="password-reqs-title">Your password needs</p>
          {policy.status === 'loading' && <p className="password-reqs-note">Loading requirements…</p>}
          {policy.status === 'error' && (
            <p className="password-reqs-note">
              The requirements couldn&apos;t be loaded. You&apos;ll see what&apos;s missing when you submit.
            </p>
          )}
          {policy.status === 'ready' && (
            <>
              <ul>
                {policy.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
              </ul>
              {policy.symbols && (
                <p className="password-reqs-note">
                  Approved symbols: <code>{policy.symbols.split('').join(' ')}</code>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
