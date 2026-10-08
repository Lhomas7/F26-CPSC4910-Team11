import { useCallback, useState } from 'react';

import * as api from '../../api';
import useApiRequest from '../../hooks/useApiRequest';

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function AttemptList({ attempts }) {
  return (
    <ul className="login-activity-list">
      {attempts.map((attempt) => (
        <li key={attempt.id} className={attempt.successful ? 'success' : 'failed'}>
          <span className={`badge ${attempt.successful ? 'badge-success' : 'badge-danger'}`}>{attempt.successful ? 'Successful' : 'Failed'}</span>
          <time dateTime={attempt.timestamp}>{formatTime(attempt.timestamp)}</time>
        </li>
      ))}
    </ul>
  );
}

export default function LoginActivityPanel() {
  const [expanded, setExpanded] = useState(false);
  const { data: activity, status: loadStatus, reload: loadActivity } = useApiRequest(
    useCallback(() => api.getLoginAttempts(), []),
  );
  const status = loadStatus === 'loading' || loadStatus === 'ready' ? loadStatus : 'error';

  const recentIds = new Set((activity?.recent || []).map((attempt) => attempt.id));
  const hasMore = Boolean(activity?.last_24_hours.some((attempt) => !recentIds.has(attempt.id)));
  const showingDay = expanded && hasMore;

  return (
    <section className="card account-card" aria-labelledby="login-activity-heading">
      <div className="account-card-header">
        <div>
          <h2 id="login-activity-heading">Recent sign-in activity</h2>
          <p>{showingDay ? 'Sign-in attempts in the last 24 hours' : 'Your last 3 sign-in attempts'}</p>
        </div>
        {status === 'ready' && hasMore && (
          <button
            className="button"
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={showingDay}
            aria-controls="login-activity-content"
          >
            {showingDay ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      <div id="login-activity-content" className="login-activity-content" aria-busy={status === 'loading'}>
        {status === 'loading' && <p className="login-activity-message">Loading sign-in activity…</p>}
        {status === 'error' && (
          <div className="banner banner-error account-banner login-activity-error" role="alert">
            <span>Your sign-in activity couldn&apos;t be loaded.</span>
            <button className="button button-link" type="button" onClick={loadActivity}>Try again</button>
          </div>
        )}
        {status === 'ready' && activity.recent.length === 0 && (
          <p className="login-activity-message">No sign-in attempts recorded yet.</p>
        )}
        {status === 'ready' && activity.recent.length > 0 && (
          <AttemptList attempts={showingDay ? activity.last_24_hours : activity.recent} />
        )}
      </div>
    </section>
  );
}
