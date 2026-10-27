import { useCallback, useEffect, useRef, useState } from 'react';

import * as api from '../api';
import { BellIcon } from '../components/primitives/Icons';

const POLL_INTERVAL_MS = 60 * 1000;

const timeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date);
}

/**
 * Bell in the sidebar that opens the signed-in user's recent alerts.
 *
 * A red dot marks unread alerts. Opening the panel marks them read; they stay
 * highlighted until the panel is next opened. Alerts can be cleared one at a
 * time or all at once. While an administrator is viewing as this user, the
 * alerts are read-only and stay unread.
 * Messages are rendered as text, never as HTML.
 */
export default function NotificationBell({ viewingAs = false }) {
  const [open, setOpen] = useState(false);
  const [center, setCenter] = useState({ results: [], unread_count: 0 });
  const [unreadAtOpen, setUnreadAtOpen] = useState(() => new Set());
  const [error, setError] = useState('');
  const shellRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      setCenter(await api.listNotifications());
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load your alerts.');
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!shellRef.current?.contains(event.target)) setOpen(false);
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

  const togglePanel = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Remember what was unread so it stays highlighted until the next open.
    setUnreadAtOpen(new Set(center.results.filter((item) => !item.read).map((item) => item.id)));
    setOpen(true);
    if (center.unread_count > 0 && !viewingAs) {
      try {
        setCenter(await api.markNotificationsRead());
      } catch (err) {
        setError(err.message || 'Could not update your alerts.');
      }
    }
  };

  const clearOne = async (id) => {
    setError('');
    try {
      await api.clearNotification(id);
      setCenter((current) => {
        const removed = current.results.find((item) => item.id === id);
        return {
          results: current.results.filter((item) => item.id !== id),
          unread_count: current.unread_count - (removed && !removed.read ? 1 : 0),
        };
      });
    } catch (err) {
      setError(err.message || 'Could not clear that alert.');
    }
  };

  const clearAll = async () => {
    setError('');
    try {
      setCenter(await api.clearAllNotifications());
    } catch (err) {
      setError(err.message || 'Could not clear your alerts.');
    }
  };

  const unread = center.unread_count;
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div className="notification-bell-shell" ref={shellRef}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        className="notification-bell"
        type="button"
        onClick={togglePanel}
      >
        <BellIcon size={18} />
        {unread > 0 && <span className="notification-dot" data-testid="notification-dot" />}
      </button>
      {open && (
        <section className="notification-panel" aria-label="Recent alerts">
          <header className="notification-panel-header">
            <strong>Recent alerts</strong>
            {!viewingAs && (
              <button
                className="notification-clear-all"
                type="button"
                onClick={clearAll}
                disabled={center.results.length === 0}
              >
                Clear all
              </button>
            )}
          </header>
          {error && <p className="notification-panel-error">{error}</p>}
          {center.results.length === 0 ? (
            !error && <p className="notification-panel-empty">No alerts yet.</p>
          ) : (
            <ul className="notification-list">
              {center.results.map((item) => {
                const isNew = !item.read || unreadAtOpen.has(item.id);
                return (
                  <li
                    key={item.id}
                    className={isNew ? 'notification-item is-unread' : 'notification-item'}
                  >
                    {isNew && <span className="notification-item-dot" aria-hidden="true" />}
                    <p>{item.message}</p>
                    <time dateTime={item.created_at}>{formatTime(item.created_at)}</time>
                    {isNew && <span className="sr-only">Unread</span>}
                    {!viewingAs && (
                      <button
                        aria-label="Clear notification"
                        className="notification-clear"
                        type="button"
                        onClick={() => clearOne(item.id)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
