import { useEffect, useMemo, useState } from 'react';

import ViewedIdentitySummary from '../components/primitives/ViewedIdentitySummary';
import { ViewingAsIcon } from '../components/primitives/Icons';
import './ActiveViewAsIndicator.css';

const FIVE_MINUTES = 5 * 60 * 1000;

function expiryDetails(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return {
    timestamp,
    time: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(timestamp),
  };
}

export default function ActiveViewAsIndicator({ user, busy, error, onReturn }) {
  const administrator = user.impersonation.admin;
  const expiry = useMemo(
    () => expiryDetails(user.impersonation.expires_at),
    [user.impersonation.expires_at],
  );
  const [clock, setClock] = useState(() => Date.now());
  const remaining = expiry ? expiry.timestamp - clock : null;
  const expiresSoon = remaining !== null && remaining > 0 && remaining <= FIVE_MINUTES;
  const expiryReached = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (!expiry) return undefined;
    const untilWarning = expiry.timestamp - Date.now() - FIVE_MINUTES;
    const untilExpiry = expiry.timestamp - Date.now();
    const timers = [];
    if (untilWarning > 0) timers.push(window.setTimeout(() => setClock(Date.now()), untilWarning));
    if (untilExpiry > 0) timers.push(window.setTimeout(() => setClock(Date.now()), untilExpiry));
    return () => timers.forEach(window.clearTimeout);
  }, [expiry]);

  return (
    <section className="view-as-indicator" aria-label="Viewing as another user">
      <ViewingAsIcon className="view-as-indicator-icon" size={22} />
      <div className="view-as-indicator-copy">
        <span className="view-as-indicator-prefix">Viewing as</span>
        <ViewedIdentitySummary
          className="view-as-indicator-identity"
          name={user.name || user.username}
          username={user.username}
          role={user.account_type}
          organization={user.company}
          showAvatar={false}
        />
        <p className={expiresSoon || expiryReached ? 'view-as-expiry-warning' : undefined}>
          Signed in as <strong>{administrator.name || administrator.username}</strong>.{' '}
          {expiryReached
            ? `This recorded session reached its scheduled end time at ${expiry.time}. Your next request will verify its status.`
            : expiresSoon
              ? `This recorded session ends in less than five minutes at ${expiry.time}.`
              : expiry
                ? `This session is recorded and ends at ${expiry.time}.`
                : 'This session is recorded.'}
        </p>
      </div>
      <button
        className="button button-large view-as-return"
        type="button"
        onClick={onReturn}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? 'Returning…' : 'Return to administrator account'}
      </button>
      {error && (
        <div className="view-as-exit-error" role="alert">
          <strong>Couldn&apos;t return to your administrator account.</strong>
          <span>
            You are still viewing as {user.name || user.username}, and requests still use their
            access. Check your connection and try again.
          </span>
        </div>
      )}
    </section>
  );
}
