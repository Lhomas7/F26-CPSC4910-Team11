import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import './Modal.css';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Accessible modal dialog. Pass `onClose` to let Escape and a backdrop click
 * dismiss it; leave it out for dialogs that need an explicit answer.
 * Focus starts on the element marked `data-autofocus` (or the first control),
 * stays inside while open, and returns to the trigger on close.
 */
export default function Modal({ title, children, actions, onClose, className = '' }) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = dialogRef.current;
    const initial = dialog.querySelector('[data-autofocus]') || dialog.querySelector(FOCUSABLE);
    (initial || dialog).focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && onCloseRef.current) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // The trigger may be gone (e.g. the Sign out button after signing out).
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, []);

  const closeOnBackdrop = (event) => {
    if (event.target === event.currentTarget && onCloseRef.current) onCloseRef.current();
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={closeOnBackdrop}>
      <div
        ref={dialogRef}
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        tabIndex="-1"
      >
        <h2 id={titleId} className="modal-title">{title}</h2>
        {children && <div id={bodyId} className="modal-body">{children}</div>}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
